const fs = require('fs-extra')
const { levels, years } = require('./src/data')
const { download, convert, normalize, upload } = require('./src/steps')

exports.run = async ({ processingConfig, axios, log }) => {
  for (const year of processingConfig.years.map(y => y).sort()) {
    for (const level of levels) {
      await log.step(`Année ${year}, niveau ${level}`)

      if (!years[year]) {
        await log.warning(`les données IGN ne sont pas référencées pour l'année ${year}`)
        continue
      }
      const url = new URL(years[year].urls[level] || years[year].urls.adminExpress)
      await download(url, axios, log)

      const geojsonPaths = []
      for (const p of years[year].paths[level]) {
        log.info(`conversion au format geojson ${p}`)
        await convert(p, p + '.geojson', log)
        geojsonPaths.push(p + '.geojson')
      }

      await normalize(
        geojsonPaths,
        `${year}-${level}-normalized.geojson`,
        years[year].mappings[level],
        log
      )
      if (processingConfig.skipUpload) {
        await log.info('le chargement du fichier dans un jeu de données est désactivé')
      } else {
        await upload(year, level, `${year}-${level}-normalized.geojson`, axios, log)
      }
    }
  }
  if (processingConfig.clearFiles) {
    await fs.emptyDir('./')
  }
}
