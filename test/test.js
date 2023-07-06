process.env.NODE_ENV = 'test'
const config = require('config')
const franceContours = require('../')
const testUtils = require('@data-fair/processings-test-utils')

process.cwd('data/')

describe('France contours processing', function () {
  it('should run a task', async function () {
    this.timeout(3600000)
    const context = testUtils.context({
      pluginConfig: {},
      processingConfig: {
        datasetIdPrefix: 'france-contours-test',
        simplifyLevel: 'medium',
        clearFiles: false,
        // these parameters are only supported for tests
        skipUpload: true,
        forceConvert: true
        // years: ['2020'],
        // levels: ['region']
      }
    }, config, false)
    const cwd = process.cwd()
    process.chdir('data/')
    await franceContours.run(context)
    process.chdir(cwd)
  })
})
