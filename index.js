const fs = require('fs-extra')
const { years, levels, simplifyLevels, getUrl, getPaths, getMappings, schemas } = require('./src/data')
const { download, convert, normalize, upload } = require('./src/steps')

exports.run = async ({ pluginConfig, processingConfig, axios, log, patchConfig }) => {
  const simplifyLevel = simplifyLevels[processingConfig.simplifyLevel]

  for (const year of (processingConfig.years || years).map(y => y).sort().reverse()) {
    const mappings = getMappings(year)
    for (const level of (processingConfig.levels || levels)) {
      await log.step(`Année ${year}, niveau ${level}`)

      await download(getUrl(year, level), axios, log)

      const geojsonPaths = []
      for (const p of getPaths(year, level)) {
        if (!await fs.pathExists(p)) {
          // level arrondissement is not present on all files (for exemple shapefiles of DOM-TOM departments)
          if (level === 'arrondissement-municipal') continue
          throw new Error(`missing file ${p}`)
        }

        const geojsonPath = `${p}-${processingConfig.simplifyLevel}.geojson`
        // try {
        await convert(p, geojsonPath, simplifyLevel[level], log, processingConfig.forceConvert)
        geojsonPaths.push(geojsonPath)
        // } catch (e) {
        //  await log.error(`échec à la conversion du fichier ${p} : ${e.message}`)
        // }
      }
      if (geojsonPaths.length !== 0) {
        const normGeojsonPath = `${year}-${level}-${processingConfig.simplifyLevel}-normalized.geojson`
        await normalize(
          geojsonPaths,
          normGeojsonPath,
          mappings[level],
          log
        )

        if (processingConfig.skipUpload) {
          await log.info('le chargement du fichier dans un jeu de données est désactivé')
        } else {
          const datasetId = `${processingConfig.datasetIdPrefix}-${year}-${level}-${processingConfig.simplifyLevel}`
          await upload(datasetId, normGeojsonPath, schemas[level], axios, log)
        }
      }
    }
  }
  if (processingConfig.clearFiles !== false) {
    await fs.emptyDir('./')
  }
}
