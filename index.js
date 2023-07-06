const fs = require('fs-extra')
const { years, levels, simplifyLevels, getUrl, getPaths, getMappings, validate, schemas } = require('./src/data')
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
          // level arrondissement is not present in all files (for exemple shapefiles of DOM-TOM departments)
          if (level === 'arrondissement-municipal') continue
          throw new Error(`missing file ${p}`)
        }

        const geojsonPath = `${p}-${processingConfig.simplifyLevel}.geojson`
        await convert(p, geojsonPath, simplifyLevel[level], log, processingConfig.forceConvert)
        geojsonPaths.push(geojsonPath)
      }
      if (geojsonPaths.length !== 0) {
        let schema = schemas[level]
        if (level === 'commune' && year === 2017) {
          schema = schema.filter(p => p.key !== 'POPULATION')
        }
        const normGeojsonPath = `${year}-${level}-${processingConfig.simplifyLevel}-normalized.geojson`
        await normalize(
          geojsonPaths,
          normGeojsonPath,
          mappings[level],
          validate(schema),
          log
        )

        if (processingConfig.skipUpload) {
          await log.info('le chargement du fichier dans un jeu de données est désactivé')
        } else {
          const datasetId = `${processingConfig.datasetIdPrefix}-${year}-${level}-${processingConfig.simplifyLevel}`
          await upload(datasetId, normGeojsonPath, schema, axios, log)
        }
      }
    }
  }
  if (processingConfig.clearFiles !== false) {
    await fs.emptyDir('./')
  }
}
