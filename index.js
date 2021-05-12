const fs = require('fs-extra')
const { years, levels, simplifyLevels, getUrl, getPaths, getMappings, schemas } = require('./src/data')
const { download, convert, normalize, upload } = require('./src/steps')

exports.run = async ({ processingConfig, axios, log }) => {
  const simplifyLevel = simplifyLevels[processingConfig.simplifyLevel]

  for (const year of years.map(y => y).sort().reverse()) {
    const mappings = getMappings(year)
    for (const level of levels) {
      await log.step(`Année ${year}, niveau ${level}`)

      await download(getUrl(year, level), axios, log)

      const geojsonPaths = []
      for (const p of getPaths(year, level)) {
        const geojsonPath = `${p}-${processingConfig.simplifyLevel}.geojson`
        await convert(p, geojsonPath, simplifyLevel[level], log, processingConfig.forceConvert)
        geojsonPaths.push(geojsonPath)
      }

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
  if (processingConfig.clearFiles) {
    await fs.emptyDir('./')
  }
}
