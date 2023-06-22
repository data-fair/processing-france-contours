const fs = require('fs-extra')
const path = require('path')
const util = require('util')
const { Transform } = require('stream')
const pump = util.promisify(require('pump'))
const exec = util.promisify(require('child_process').exec)
const ogr2ogr = require('ogr2ogr')
const JSONStream = require('JSONStream')
const FormData = require('form-data')
const MultiStream = require('multistream')

function displayBytes (aSize) {
  aSize = Math.abs(parseInt(aSize, 10))
  if (aSize === 0) return '0 octets'
  const def = [[1, 'octets'], [1000, 'ko'], [1000 * 1000, 'Mo'], [1000 * 1000 * 1000, 'Go'], [1000 * 1000 * 1000 * 1000, 'To'], [1000 * 1000 * 1000 * 1000 * 1000, 'Po']]
  for (let i = 0; i < def.length; i++) {
    if (aSize < def[i][0]) return (aSize / def[i - 1][0]).toLocaleString() + ' ' + def[i - 1][1]
  }
}

const withStreamableFile = async (filePath, tmpDir, fn) => {
  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(path.join(tmpDir, filePath + '.tmp'))
  await fn(fs.createWriteStream(path.join(tmpDir, filePath + '.tmp')))
  // Try to prevent weird bug with NFS by forcing syncing file before reading it
  const fd = await fs.open(path.join(tmpDir, filePath + '.tmp'), 'r')
  await fs.fsync(fd)
  await fs.close(fd)
  // write in tmp file then move it for a safer operation that doesn't create partial files
  await fs.move(path.join(tmpDir, filePath + '.tmp'), path.join(tmpDir, filePath), { overwrite: true })
}

exports.download = async (url, axios, tmpDir, log) => {
  const fileName = path.parse(url.pathname).base
  if (await fs.pathExists(path.join(tmpDir, fileName))) {
    log.info(`le fichier ${fileName} a déjà été téléchargé`)
  } else {
    log.info(`téléchargement du fichier ${fileName}`)
    await withStreamableFile(fileName, tmpDir, async (writeStream) => {
      if (url.protocol === 'ftp:') {
        const FTPClient = require('promise-ftp')
        const ftp = new FTPClient()
        const serverMessage = await ftp.connect({ host: url.host, user: url.username, password: url.password })
        await log.info('connecté au ftp : ' + serverMessage)
        await log.info('Début du téléchargement ftp')
        await pump(await ftp.get(url.pathname), writeStream)
        await log.info('Fin du téléchargement')
        await ftp.end()
      } else {
        await log.info('Début du téléchargement')
        let res
        let i = 0
        while (!res && i < 10) {
          try {
            res = await axios({ url: url.href, method: 'GET', responseType: 'stream' })
            await pump(res.data, writeStream)
            await log.info('Fin du téléchargement')
          } catch (err) {
            await log.warning(`échec à la récupération du fichier ${fileName}, nouvel essai...`)
          }
          i++
        }
      }
    })
  }

  if (await fs.pathExists(path.join(tmpDir, fileName.split('.')[0]))) {
    log.info(`le fichier ${fileName.split('.')[0]} a déjà été décompressé`)
  } else if (fileName.endsWith('.7z') || fileName.endsWith('.7z.001')) {
    log.info(`extraction de l'archive ${fileName}`)
    log.info('test : ' + `7z x -y ${path.join(tmpDir, fileName)} -o${path.join(tmpDir)}`)
    await exec(`7z x -y ${path.join(tmpDir, fileName)} -o${path.join(tmpDir)}`)
  }
}

exports.convert = async (filePath, geojsonPath, simplify, tmpDir, log, forceConvert) => {
  if (await fs.pathExists(geojsonPath) && !forceConvert) {
    log.info(`le fichier a déjà été converti ${geojsonPath}`)
  } else {
    log.info(`conversion au format geojson ${geojsonPath} ${simplify}`)
    await withStreamableFile(geojsonPath, tmpDir, async (writeStream) => {
      const options = ['-lco', 'RFC7946=YES', '-lco', 'ENCODING=UTF-8', '-t_srs', 'EPSG:4326']
      if (simplify) {
        options.push('-simplify')
        options.push(simplify)
      }
      const geoJsonStream = ogr2ogr(path.join(tmpDir, filePath))
        .format('GeoJSON')
        .options(options)
        .timeout(6000000)
        .stream()
      await pump(geoJsonStream, writeStream)
    })
  }
}

exports.normalize = async (geojsonPaths, normalizedPath, mapping, tmpDir, log) => {
  log.info('normalisation du contenu')
  await withStreamableFile(normalizedPath, tmpDir, async (writeStream) => {
    await pump(
      new MultiStream(geojsonPaths.map(geojsonPath => fs.createReadStream(tmpDir + geojsonPath))),
      JSONStream.parse('features.*'),
      new Transform({
        objectMode: true,
        transform (feature, encoding, callback) {
          // console.log(feature.properties)
          Object.assign(feature, mapping(feature.properties))
          // console.log(feature.id, JSON.stringify(feature.properties))
          callback(null, feature)
        }
      }),
      JSONStream.stringify('{ "type": "FeatureCollection", "features": [\n', ',\n  ', '\n]}'),
      writeStream
    )
  })
}

exports.upload = async (id, filePath, schema, axios, log) => {
  await log.info('chargement du fichier dans un jeu de données')
  const formData = new FormData()
  formData.append('schema', JSON.stringify(schema))
  formData.append('title', id.replace(/-/g, ' '))
  formData.append('file', fs.createReadStream(filePath), { filename: path.parse(filePath).base })
  formData.getLength = util.promisify(formData.getLength)
  const contentLength = await formData.getLength()
  await log.info(`chargement de (${displayBytes(contentLength)})`)
  await axios({
    method: 'put',
    url: `api/v1/datasets/${id}`,
    data: formData,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: { ...formData.getHeaders(), 'content-length': contentLength }
  })
}
