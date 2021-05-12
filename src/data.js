// revers order is important, data from recent years are used to complete older data
exports.years = [2020, 2019, 2018, 2017]
// exports.years = [2020]

// order is important, data from higher levels are used to complete lower levels
exports.levels = ['region', 'departement', 'epci', 'commune', 'iris']
// exports.levels = ['region']

// geometry simplification
exports.simplifyLevels = {
  full: {},
  precise: {
    region: '6',
    departement: '4',
    epci: '2',
    commune: '2',
    iris: '2'
  },
  medium: {
    region: '30',
    departement: '20',
    epci: '10',
    commune: '10',
    iris: '10'
  },
  simple: {
    region: '150',
    departement: '100',
    epci: '50',
    commune: '50',
    iris: '50'
  }
}

// données admin express COG pour des tracés géographique en accord avec la nomenclature insee du découpage territorial
// cf https://geoservices.ign.fr/documentation/diffusion/telechargement-donnees-libres.html#admin-express
const adminExpressLevels = ['region', 'departement', 'epci', 'commune']

/*
  info necessary for the download step
*/
const urls = {
  2017: {
    adminExpress: 'https://wxs.ign.fr/x02uy2aiwjo9bm8ce5plwqmr/telechargement/prepackage/ADMINEXPRESS-COG-PACK_2017-07-07%24ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/file/ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19.7z',
    iris: 'ftp://Contours_IRIS_ext:ao6Phu5ohJ4jaeji@ftp3.ign.fr/CONTOURS-IRIS_2-1__SHP__FRA_2017-01-01.7z'
  },
  2018: {
    adminExpress: 'ftp://Admin_Express_ext:Dahnoh0eigheeFok@ftp3.ign.fr/ADMIN-EXPRESS-COG_1-1__SHP__FRA_2018-04-03.7z',
    iris: 'ftp://Contours_IRIS_ext:ao6Phu5ohJ4jaeji@ftp3.ign.fr/CONTOURS-IRIS_2-1__SHP__FRA_2018-01-01.7z.001'
  },
  2019: {
    adminExpress: 'ftp://Admin_Express_ext:Dahnoh0eigheeFok@ftp3.ign.fr/ADMIN-EXPRESS-COG_2-0__SHP__FRA_L93_2019-09-24.7z.001',
    iris: 'ftp://Contours_IRIS_ext:ao6Phu5ohJ4jaeji@ftp3.ign.fr/CONTOURS-IRIS_2-1__SHP__FRA_2019-01-01.7z.001'
  },
  2020: {
    adminExpress: 'ftp://Admin_Express_ext:Dahnoh0eigheeFok@ftp3.ign.fr/ADMIN-EXPRESS-COG_2-1__SHP__FRA_L93_2020-11-20.7z',
    iris: 'ftp://Contours_IRIS_ext:ao6Phu5ohJ4jaeji@ftp3.ign.fr/CONTOURS-IRIS_2-1__SHP__FRA_2020-01-01.7z'
  }
}

exports.getUrl = (year, level) => {
  return new URL(adminExpressLevels.includes(level) ? urls[year].adminExpress : urls[year][level])
}

/*
  info necessary to get the full shapefile paths for the convert step
*/
const adminExpressPrefixes = {
  2017: 'ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2017-06-19',
  2018: 'ADMIN-EXPRESS-COG_1-1__SHP__FRA_2018-04-03/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2018-03-28',
  2019: 'ADMIN-EXPRESS-COG_2-0__SHP__FRA_2019-09-24/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2019-09-24',
  2020: 'ADMIN-EXPRESS-COG_2-1__SHP__FRA_2020-11-20/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2020-11-20'
}
const adminExpressDirs = {
  2017: ['ADE-COG_1-0_SHP_LAMB93_FR', 'ADE-COG_1-0_SHP_UTM20W84GUAD_D971', 'ADE-COG_1-0_SHP_UTM20W84MART_D972', 'ADE-COG_1-0_SHP_UTM22RGFG95_D973', 'ADE-COG_1-0_SHP_RGR92UTM40S_D974', 'ADE-COG_1-0_SHP_RGM04UTM38S_D976'],
  2019: ['ADE-COG_2-0_SHP_LAMB93_FR', 'ADE-COG_2-0_SHP_RGAF09UTM20_D971', 'ADE-COG_2-0_SHP_RGAF09UTM20_D972', 'ADE-COG_2-0_SHP_UTM22RGFG95_D973', 'ADE-COG_2-0_SHP_RGR92UTM40S_D974', 'ADE-COG_2-0_SHP_RGM04UTM38S_D976']
}
adminExpressDirs[2018] = adminExpressDirs[2017].map(dir => dir.replace('COG_1-0', 'COG_1-1'))
adminExpressDirs[2020] = adminExpressDirs[2019].map(dir => dir.replace('COG_2-0', 'COG_2-1'))
const adminExpressShp = {
  region: 'REGION',
  departement: 'DEPARTEMENT',
  epci: 'EPCI',
  commune: 'COMMUNE',
  iris: 'CONTOURS-IRIS'
}
const irisPrefixes = {
  2017: 'CONTOURS-IRIS_2-1__SHP__FRA_2017-01-01/CONTOURS-IRIS/1_DONNEES_LIVRAISON_2018-06-00105',
  2018: 'CONTOURS-IRIS_2-1__SHP__FRA_2018-01-01/CONTOURS-IRIS/1_DONNEES_LIVRAISON_2018-07-00057',
  2019: 'CONTOURS-IRIS_2-1__SHP__FRA_2020-01-01/CONTOURS-IRIS/1_DONNEES_LIVRAISON_2020-01-00139',
  2020: 'CONTOURS-IRIS_2-1__SHP__FRA_2020-01-01/CONTOURS-IRIS/1_DONNEES_LIVRAISON_2020-12-00282'
}
const irisDirs = {
  2017: ['CONTOURS-IRIS_2-1_SHP_LAMB93_FXX-2017', 'CONTOURS-IRIS_2-1_SHP_RGM04UTM38S_MYT-2017', 'CONTOURS-IRIS_2-1_SHP_RGR92UTM40S_REU-2017', 'CONTOURS-IRIS_2-1_SHP_RGSPM06U21_SPM-2017', 'CONTOURS-IRIS_2-1_SHP_UTM20W84GUAD_GLP-2017', 'CONTOURS-IRIS_2-1_SHP_UTM20W84MART_MTQ-2017', 'CONTOURS-IRIS_2-1_SHP_UTM22RGFG95_GUF-2017'],
  2019: ['CONTOURS-IRIS_2-1_SHP_LAMB93_FXX-2019', 'CONTOURS-IRIS_2-1_SHP_RGM04UTM38S_MYT-2019', 'CONTOURS-IRIS_2-1_SHP_RGR92UTM40S_REU-2019', 'CONTOURS-IRIS_2-1_SHP_RGAF09UTM20_GLP-2019', 'CONTOURS-IRIS_2-1_SHP_RGAF09UTM20_MTQ-2019', 'CONTOURS-IRIS_2-1_SHP_UTM22RGFG95_GUF-2019'],
  2020: ['CONTOURS-IRIS_2-1_SHP_LAMB93_FXX-2020', 'CONTOURS-IRIS_2-1_SHP_LAMB93_FXX-2020', 'CONTOURS-IRIS_2-1_SHP_RGR92UTM40S_REU-2020', 'CONTOURS-IRIS_2-1_SHP_RGAF09UTM20_GLP-2020', 'CONTOURS-IRIS_2-1_SHP_RGAF09UTM20_MTQ-2020', 'CONTOURS-IRIS_2-1_SHP_UTM22RGFG95_GUF-2020']
}
irisDirs[2018] = irisDirs[2017].map(dir => dir.replace('2017', '2018'))

exports.getPaths = (year, level) => {
  if (level === 'iris') {
    return irisDirs[year].map(dir => `${irisPrefixes[year]}/${dir}/CONTOURS-IRIS.shp`)
  }
  if (adminExpressLevels.includes(level)) {
    return adminExpressDirs[year].map(dir => `${adminExpressPrefixes[year]}/${dir}/${adminExpressShp[level]}.shp`)
  }
}

/*
  mapping used by the normalize step
*/
// object used to store some data useful to read info from one level to another
const memory = {}

// fix keys order in object
const sortKeys = (obj) => {
  const keys = Object.keys(obj).sort((a, b) => {
    const partsA = a.split('_')
    const partsB = b.split('_')
    if (partsA.length !== partsB.length) return partsA.length - partsB.length
    const comp1 = partsA.pop().localeCompare(partsB.pop())
    if (comp1 !== 0) return comp1
    return partsA.pop().localeCompare(partsB.pop()) * -1
  })
  return keys.reduce((clone, key) => { clone[key] = obj[key]; return clone }, {})
}

exports.getMappings = (year) => {
  return {
    region: (props) => {
      delete props.NOM_REG_M
      delete props.ID
      memory[`reg-${props.INSEE_REG}`] = memory[`reg-${props.INSEE_REG}`] ||
        { NOM_REG: props.NOM_REG, CHF_REG: props.CHF_REG }
      return {
        id: `reg-${year}-${props.INSEE_REG}`,
        properties: sortKeys({
          niveau: 'région',
          annee: year,
          ...props,
          ...memory[`reg-${props.INSEE_REG}`] // use the data from most recent year (more complete)
        })
      }
    },
    departement: (props) => {
      delete props.NOM_DEP_M
      delete props.ID
      memory[`dep-${props.INSEE_DEP}`] = memory[`dep-${props.INSEE_DEP}`] ||
        { NOM_DEP: props.NOM_DEP, CHF_DEP: props.CHF_DEP }
      return {
        id: `dep-${year}-${props.INSEE_DEP}`,
        properties: sortKeys({
          niveau: 'département',
          annee: year,
          ...props,
          ...memory[`dep-${props.INSEE_DEP}`], // use the data from most recent year (more complete)
          NOM_REG: memory[`reg-${props.INSEE_REG}`].NOM_REG
        })
      }
    },
    epci: (props) => {
      delete props.ID
      const id = `epci-${year}-${props.CODE_EPCI}`
      memory[id] = { NOM_EPCI: props.NOM_EPCI, TYPE_EPCI: props.TYPE_EPCI }
      return {
        id,
        properties: sortKeys({
          niveau: 'EPCI',
          annee: 2017,
          ...props
        })
      }
    },
    commune: (props) => {
      delete props.ID
      delete props.NOM_COM_M
      const epci = memory[`epci-${year}-${props.CODE_EPCI}`]
      return {
        id: `com-${year}-${props.INSEE_COM}`,
        properties: sortKeys({
          niveau: 'commune',
          annee: 2017,
          ...props,
          NOM_REG: memory[`reg-${props.INSEE_REG}`].NOM_REG,
          NOM_DEP: memory[`dep-${props.INSEE_DEP}`].NOM_DEP,
          ...epci
        })
      }
    },
    iris: (props) => {
      return {
        id: `iris-${year}-${props.CODE_IRIS}`,
        properties: sortKeys({
          niveau: 'IRIS',
          annee: year,
          ...props
        })
      }
    }
  }
}

/*
 * schemas used for upload step
 */

const inseeReg = { key: 'INSEE_REG', 'x-originalName': 'INSEE_REG', title: 'Code région', type: 'string', ignoreDetection: true, 'x-refersTo': 'http://rdf.insee.fr/def/geo#codeRegion' }
const nomReg = { key: 'NOM_REG', 'x-originalName': 'NOM_REG', title: 'Nom région', type: 'string' }
const chfReg = { key: 'CHF_REG', 'x-originalName': 'CHF_REG', title: 'Code chef lieu région', type: 'string' }
const inseeDep = { key: 'INSEE_DEP', 'x-originalName': 'INSEE_DEP', title: 'Code département', type: 'string', ignoreDetection: true, 'x-refersTo': 'http://rdf.insee.fr/def/geo#codeDepartement' }
const nomDep = { key: 'NOM_DEP', 'x-originalName': 'NOM_DEP', title: 'Nom département', type: 'string' }
const chfDep = { key: 'CHF_DEP', 'x-originalName': 'CHF_DEP', title: 'Code chef lieu département', type: 'string' }
const typeEpci = { key: 'TYPE_EPCI', 'x-originalName': 'TYPE_EPCI', title: 'Type EPCI', type: 'string' }
const nomEpci = { key: 'NOM_EPCI', 'x-originalName': 'NOM_EPCI', title: 'Nom EPCI', type: 'string' }
const codeEpci = { key: 'CODE_EPCI', 'x-originalName': 'CODE_EPCI', title: 'Code EPCI', type: 'string', ignoreDetection: true, 'x-refersTo': 'http://rdf.insee.fr/def/geo#EtablissementPublicDeCooperationIntercommunale' }
const inseeCom = { key: 'INSEE_COM', 'x-originalName': 'INSEE_COM', title: 'Code commune', type: 'string', ignoreDetection: true, 'x-refersTo': 'http://rdf.insee.fr/def/geo#codeCommune' }
const nomCom = { key: 'NOM_COM', 'x-originalName': 'NOM_COM', title: 'Nom commune', type: 'string', 'x-refersTo': 'http://schema.org/City' }
const pop = { key: 'POPULATION', 'x-originalName': 'POPULATION', title: 'Population', type: 'string' }
const statut = { key: 'STATUT', 'x-originalName': 'STATUT', title: 'Statut', type: 'string' }
const inseeArr = { key: 'INSEE_ARR', 'x-originalName': 'INSEE_ARR', title: 'Code arrondissement', type: 'string', ignoreDetection: true }
const inseeCan = { key: 'INSEE_CAN', 'x-originalName': 'INSEE_CAN', title: 'Code canton', type: 'string', ignoreDetection: true }
const typeIris = { key: 'TYP_IRIS', 'x-originalName': 'TYP_IRIS', title: 'Type IRIS', type: 'string' }
const nomIris = { key: 'NOM_IRIS', 'x-originalName': 'NOM_IRIS', title: 'Nom IRIS', type: 'string' }
const codeIris = { key: 'CODE_IRIS', 'x-originalName': 'CODE_IRIS', title: 'Code IRIS', type: 'string', ignoreDetection: true, 'x-refersTo': 'http://rdf.insee.fr/def/geo#codeIRIS' }

exports.schemas = {
  region: [nomReg, inseeReg, chfReg],
  departement: [nomDep, inseeDep, chfDep, nomReg, inseeReg],
  epci: [nomEpci, codeEpci, typeEpci],
  commune: [nomCom, inseeCom, statut, pop, inseeArr, inseeCan, nomReg, inseeReg, nomDep, inseeDep, nomEpci, codeEpci, typeEpci],
  iris: [nomIris, codeIris, typeIris, nomCom, inseeCom]
}
