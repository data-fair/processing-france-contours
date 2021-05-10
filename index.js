const fs = require('fs-extra')
const path = require('path')
const util = require('util')
const { Transform } = require('stream')
const pump = util.promisify(require('pump'))
const exec = util.promisify(require('child_process').exec)
const ogr2ogr = require('ogr2ogr')
const JSONStream = require('JSONStream')
const FormData = require('form-data')

const levels = ['region', 'departement', 'epci', 'commune', 'iris']
// const levels = ['region', 'departement']

function displayBytes (aSize) {
  aSize = Math.abs(parseInt(aSize, 10))
  if (aSize === 0) return '0 octets'
  const def = [[1, 'octets'], [1000, 'ko'], [1000 * 1000, 'Mo'], [1000 * 1000 * 1000, 'Go'], [1000 * 1000 * 1000 * 1000, 'To'], [1000 * 1000 * 1000 * 1000 * 1000, 'Po']]
  for (let i = 0; i < def.length; i++) {
    if (aSize < def[i][0]) return (aSize / def[i - 1][0]).toLocaleString() + ' ' + def[i - 1][1]
  }
}

// données admin express COG pour des tracés géographique en accord avec la nomenclature insee du découpage territorial
// cf https://geoservices.ign.fr/documentation/diffusion/telechargement-donnees-libres.html#admin-express

// object used to store some data useful to read info from one level to another
const memory = {}

const years = {
  2017: {
    urls: {
      adminExpress: 'https://wxs.ign.fr/x02uy2aiwjo9bm8ce5plwqmr/telechargement/prepackage/ADMINEXPRESS-COG-PACK_2017-07-07%24ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/file/ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19.7z',
      iris: 'ftp://Contours_IRIS_ext:ao6Phu5ohJ4jaeji@ftp3.ign.fr/CONTOURS-IRIS_2-1__SHP__FRA_2017-01-01.7z'
    },
    paths: {
      region: 'ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2017-06-19/ADE-COG_1-0_SHP_LAMB93_FR/REGION.shp',
      departement: 'ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2017-06-19/ADE-COG_1-0_SHP_LAMB93_FR/DEPARTEMENT.shp',
      epci: 'ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2017-06-19/ADE-COG_1-0_SHP_LAMB93_FR/EPCI.shp',
      commune: 'ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2017-06-19/ADE-COG_1-0_SHP_LAMB93_FR/COMMUNE.shp',
      iris: 'CONTOURS-IRIS_2-1__SHP__FRA_2017-01-01/CONTOURS-IRIS/1_DONNEES_LIVRAISON_2018-06-00105/CONTOURS-IRIS_2-1_SHP_LAMB93_FXX-2017/CONTOURS-IRIS.shp'
    },
    mappings: {
      region: (props) => {
        const id = `reg-2017-${props.INSEE_REG}`
        memory[id] = props.NOM_REG
        return {
          id,
          properties: {
            niveau: 'région',
            ...props,
            ID: undefined
          }
        }
      },
      departement: (props) => {
        return {
          id: `dep-2017-${props.INSEE_DEP}`,
          properties: {
            niveau: 'département',
            ...props,
            NOM_REG: memory[`reg-2017-${props.INSEE_REG}`],
            ID: undefined
          }
        }
      },
      epci: (props) => {
        const id = `epci-2017-${props.CODE_EPCI}`
        memory[id] = { NOM_EPCI: props.NOM_EPCI, TYPE_EPCI: props.TYPE_EPCI }
        return {
          id,
          properties: {
            niveau: 'EPCI',
            ...props,
            ID: undefined
          }
        }
      },
      commune: (props) => {
        const epci = memory[`epci-2017-${props.CODE_EPCI}`]
        return {
          id: `com-2017-${props.INSEE_COM}`,
          properties: {
            niveau: 'commune',
            ...props,
            ...epci,
            ID: undefined,
            NOM_COM_M: undefined
          }
        }
      },
      iris: (props) => {
        return {
          id: `iris-2017-${props.CODE_IRIS}`,
          properties: {
            ...props
          }
        }
      }
    }
  }
  /* 2018: {
    adminExpress: 'ftp://Admin_Express_ext:Dahnoh0eigheeFok@ftp3.ign.fr/ADMIN-EXPRESS-COG_1-1__SHP__FRA_2018-04-03.7z',
    iris: 'ftp://Contours_IRIS_ext:ao6Phu5ohJ4jaeji@ftp3.ign.fr/CONTOURS-IRIS_2-1__SHP__FRA_2018-01-01.7z.001'
  },
  2019: {
    adminExpress: 'ftp://Admin_Express_ext:Dahnoh0eigheeFok@ftp3.ign.fr/ADMIN-EXPRESS-COG_2-0__SHP__FRA_L93_2019-09-24.7z.001',
    iris: 'ftp://Contours_IRIS_ext:ao6Phu5ohJ4jaeji@ftp3.ign.fr/CONTOURS-IRIS_2-1__SHP__FRA_2019-01-01.7z.001'
  },
  2020: {
    adminExpress: 'ftp://Admin_Express_ext:Dahnoh0eigheeFok@ftp3.ign.fr/ADMIN-EXPRESS-COG_2-1__SHP__FRA_L93_2020-11-20.7z',
    iris: 'ftp://Contours_IRIS_ext:ao6Phu5ohJ4jaeji@ftp3.ign.fr/CONTOURS-IRIS_2-1__SHP__FRA_2020-01-01.7z'
  } */
}

const withStreamableFile = async (filePath, fn) => {
  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(filePath + '.tmp')
  await fn(fs.createWriteStream(filePath + '.tmp'))
  // Try to prevent weird bug with NFS by forcing syncing file before reading it
  const fd = await fs.open(filePath + '.tmp', 'r')
  await fs.fsync(fd)
  await fs.close(fd)
  // write in tmp file then move it for a safer operation that doesn't create partial files
  await fs.move(filePath + '.tmp', filePath, { overwrite: true })
}

const download = async (url, axios, dir, log) => {
  const fileName = path.parse(url.pathname).base
  const filePath = path.join(dir, fileName)
  if (await fs.pathExists(filePath)) {
    log.debug(`le fichier ${fileName} a déjà été téléchargé`)
  } else {
    log.info(`téléchargement du fichier ${fileName}`)
    await withStreamableFile(filePath, async (writeStream) => {
      if (url.protocol === 'ftp:') {
        const FTPClient = require('promise-ftp')
        const ftp = new FTPClient()
        const serverMessage = await ftp.connect({ host: url.host, user: url.username, password: url.password })
        await log.debug('connecté au ftp : ' + serverMessage)
        await pump(await ftp.get(url.pathname), writeStream)
        await ftp.end()
      } else {
        const res = await axios({ url: url.href, method: 'GET', responseType: 'stream' })
        await pump(res.data, writeStream)
      }
    })
  }

  if (fileName.endsWith('.7z')) {
    const { stderr } = await exec(`7z x -y ${fileName}`, { cwd: dir })
    if (stderr) throw new Error(`échec à l'extraction de l'archive ${filePath} : ${stderr}`)
  }
}

const convert = async (filePath, geojsonPath, log) => {
  log.info(`conversion au format geojson ${geojsonPath}`)
  if (await fs.pathExists(geojsonPath)) {
    log.debug('le fichier a déjà été converti')
  } else {
    await withStreamableFile(geojsonPath, async (writeStream) => {
      const geoJsonStream = ogr2ogr(filePath)
        .format('GeoJSON')
        .options(['-lco', 'RFC7946=YES', '-lco', 'ENCODING=UTF-8', '-t_srs', 'EPSG:4326'])
        .timeout(600000)
        .stream()
      await pump(geoJsonStream, writeStream)
    })
  }
}

const normalize = async (geojsonPath, normalizedPath, mapping, log) => {
  log.info('normalisation du contenu')
  await withStreamableFile(normalizedPath, async (writeStream) => {
    await pump(
      fs.createReadStream(geojsonPath),
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

const upload = async (year, level, filePath, axios, log) => {
  log.info('chargement du fichier dans un jeu de données')
  const formData = new FormData()
  formData.append('file', fs.createReadStream(filePath), { filename: path.parse(filePath).base })
  formData.getLength = util.promisify(formData.getLength)
  const contentLength = await formData.getLength()
  await log.info(`chargement de (${displayBytes(contentLength)})`)
  await axios({
    method: 'put',
    url: `api/v1/datasets/france-contours-${year}-${level}`,
    data: formData,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: { ...formData.getHeaders(), 'content-length': contentLength }
  })
}

exports.run = async ({ processingConfig, axios, log, dir }) => {
  for (const year of processingConfig.years.map(y => y).sort()) {
    for (const level of levels) {
      await log.step(`Année ${year}, niveau ${level}`)

      if (!years[year]) {
        await log.warning(`les données IGN ne sont pas référencées pour l'année ${year}`)
        continue
      }
      const url = new URL(years[year].urls[level] || years[year].urls.adminExpress)
      await download(url, axios, dir, log)
      await convert(
        path.join(dir, years[year].paths[level]),
        path.join(dir, `${year}-${level}.geojson`),
        log
      )
      await normalize(
        path.join(dir, `${year}-${level}.geojson`),
        path.join(dir, `${year}-${level}-normalized.geojson`),
        years[year].mappings[level],
        log
      )
      if (processingConfig.skipUpload) {
        await log.info('le chargement du fichier dans un jeu de données est désactivé')
      } else {
        await upload(year, level, path.join(dir, `${year}-${level}-normalized.geojson`), axios, log)
      }
    }
  }
  if (processingConfig.clearFiles) {
    await fs.emptyDir(dir)
  }
}
