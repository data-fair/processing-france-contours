process.env.NODE_ENV = 'test'
const path = require('path')
const config = require('config')
const axios = require('axios')
const chalk = require('chalk')
const moment = require('moment')
const assert = require('assert').strict
const franceContours = require('../')

describe('Hello world processing', () => {
  it('should expose a processing config schema for users', async () => {
    const schema = require('../processing-config-schema.json')
    assert.equal(schema.type, 'object')
  })

  it('should run a task', async function () {
    this.timeout(3600000)

    const axiosInstance = axios.create({
      baseURL: config.dataFairUrl,
      headers: { 'x-apiKey': config.dataFairAPIKey }
    })
    // customize axios errors for shorter stack traces when a request fails
    axiosInstance.interceptors.response.use(response => response, error => {
      if (!error.response) return Promise.reject(error)
      delete error.response.request
      delete error.response.headers
      error.response.config = { method: error.response.config.method, url: error.response.config.url, data: error.response.config.data }
      if (error.response.config.data && error.response.config.data._writableState) delete error.response.config.data
      if (error.response.data && error.response.data._readableState) delete error.response.data
      return Promise.reject(error.response)
    })
    const processingConfig = {
      years: [2017],
      clearFiles: false,
      skipUpload: true
    }
    const log = {
      step: (msg) => console.log(chalk.blue.bold.underline(`[${moment().format('LTS')}] ${msg}`)),
      error: (msg, extra) => console.log(chalk.red.bold(`[${moment().format('LTS')}] ${msg}`), extra),
      warning: (msg, extra) => console.log(chalk.red(`[${moment().format('LTS')}] ${msg}`), extra),
      info: (msg, extra) => console.log(chalk.blue(`[${moment().format('LTS')}] ${msg}`), extra),
      debug: (msg, extra) => {
        console.log(`[${moment().format('LTS')}] ${msg}`, extra)
      }
    }
    const patchConfig = async (patch) => {
      console.log('received config patch', patch)
      Object.assign(processingConfig, patch)
    }
    await franceContours.run({ processingConfig, axios: axiosInstance, log, patchConfig, dir: path.resolve('./data/') })
  })
})
