const fs = require('fs-extra')
const { levels, getUrl, getPaths, getMappings } = require('./src/data')
const { download, convert, normalize, upload } = require('./src/steps')

exports.run = async ({ processingConfig, axios, log }) => {
  for (const year of processingConfig.years.map(y => y).sort()) {
    const mappings = getMappings(year)
    for (const level of levels) {
      await log.step(`Année ${year}, niveau ${level}`)

      await download(getUrl(year, level), axios, log)

      const geojsonPaths = []
      for (const p of getPaths(year, level)) {
        await convert(p, p + '.geojson', log)
        geojsonPaths.push(p + '.geojson')
      }

      await normalize(
        geojsonPaths,
        `${year}-${level}-normalized.geojson`,
        mappings[level],
        log
      )
      if (processingConfig.skipUpload) {
        await log.info('le chargement du fichier dans un jeu de données est désactivé')
      } else {
        await upload(processingConfig.datasetIdPrefix, year, level, `${year}-${level}-normalized.geojson`, axios, log)
      }
    }
  }
  if (processingConfig.clearFiles) {
    await fs.emptyDir('./')
  }
}
