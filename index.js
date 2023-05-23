const fs = require('fs-extra')
const { years, levels, simplifyLevels, getUrl, getPaths, getMappings, schemas } = require('./src/data')
const { download, convert, normalize, upload } = require('./src/steps')

exports.run = async ({ pluginConfig, processingConfig, tmpDir, axios, log, patchConfig }) => {
  const simplifyLevel = simplifyLevels[processingConfig.simplifyLevel]

  for (const year of years.map(y => y).sort().reverse()) {
    const mappings = getMappings(year)
    for (const level of levels) {
      await log.step(`Année ${year}, niveau ${level}`)

      await download(getUrl(year, level), axios, tmpDir, log)

      const geojsonPaths = []
      for (const p of getPaths(year, level)) {
        const geojsonPath = `${p}-${processingConfig.simplifyLevel}.geojson`
        try {
          await convert(p, geojsonPath, simplifyLevel[level], tmpDir, log, processingConfig.forceConvert)
          geojsonPaths.push(geojsonPath)
        } catch (e) {
          await log.error(`échec à la conversion du fichier ${p}`)
        }
      }
      if (geojsonPaths.length !== 0) {
        const normGeojsonPath = `${year}-${level}-${processingConfig.simplifyLevel}-normalized.geojson`
        await normalize(
          geojsonPaths,
          normGeojsonPath,
          mappings[level],
          tmpDir,
          log
        )

        if (processingConfig.skipUpload) {
          await log.info('le chargement du fichier dans un jeu de données est désactivé')
        } else {
          const datasetId = `${processingConfig.datasetIdPrefix}-${year}-${level}-${processingConfig.simplifyLevel}`
          await upload(datasetId, tmpDir + normGeojsonPath, schemas[level], axios, log)
        }
      }
    }
  }
  if (processingConfig.clearFiles) {
    await fs.emptyDir('./')
  }
}
