const fs = require('fs-extra')
const path = require('path')
const { levels, years } = require('./src/data')
const { download, convert, normalize, upload } = require('./src/steps')

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

      const geojsonPaths = []
      for (const p of years[year].paths[level]) {
        log.info(`conversion au format geojson ${p}`)
        const geojsonPath = path.join(dir, `${p}.geojson`)
        await convert(path.join(dir, p), geojsonPath, log)
        geojsonPaths.push(geojsonPath)
      }

      await normalize(
        geojsonPaths,
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
