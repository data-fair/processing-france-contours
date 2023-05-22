process.env.NODE_ENV = 'test'
const config = require('config')
const franceContours = require('../')
const testUtils = require('@data-fair/processings-test-utils')

describe('France contours processing', function () {
  it('should run a task', async function () {
    this.timeout(3600000)
    const context = testUtils.context({
      pluginConfig: {},
      processingConfig: {
        clearFiles: false,
        skipUpload: false,
        forceConvert: true,
        datasetIdPrefix: 'france-contours-test',
        simplifyLevel: 'simple'
      },
      tmpDir: 'data/'
    }, config, false)
    await franceContours.run(context)
  })
})
