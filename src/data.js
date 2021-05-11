exports.levels = ['region', 'departement', 'epci', 'commune', 'iris']

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

exports.getMappings = (year) => {
  return {
    region: (props) => {
      const id = `reg-${year}-${props.INSEE_REG}`
      memory[id] = props.NOM_REG
      return {
        id,
        properties: {
          niveau: 'région',
          annee: year,
          ...props,
          ID: undefined
        }
      }
    },
    departement: (props) => {
      return {
        id: `dep-${year}-${props.INSEE_DEP}`,
        properties: {
          niveau: 'département',
          annee: year,
          ...props,
          NOM_REG: memory[`reg-2017-${props.INSEE_REG}`],
          ID: undefined
        }
      }
    },
    epci: (props) => {
      const id = `epci-${year}-${props.CODE_EPCI}`
      memory[id] = { NOM_EPCI: props.NOM_EPCI, TYPE_EPCI: props.TYPE_EPCI }
      return {
        id,
        properties: {
          niveau: 'EPCI',
          annee: 2017,
          ...props,
          ID: undefined
        }
      }
    },
    commune: (props) => {
      const epci = memory[`epci-${year}-${props.CODE_EPCI}`]
      return {
        id: `com-${year}-${props.INSEE_COM}`,
        properties: {
          niveau: 'commune',
          annee: 2017,
          ...props,
          ...epci,
          ID: undefined,
          NOM_COM_M: undefined
        }
      }
    },
    iris: (props) => {
      return {
        id: `iris-${year}-${props.CODE_IRIS}`,
        properties: {
          niveau: 'IRIS',
          annee: year,
          ...props
        }
      }
    }
  }
}
