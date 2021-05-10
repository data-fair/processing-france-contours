
// données admin express COG pour des tracés géographique en accord avec la nomenclature insee du découpage territorial
// cf https://geoservices.ign.fr/documentation/diffusion/telechargement-donnees-libres.html#admin-express

exports.levels = ['region', 'departement', 'epci', 'commune', 'iris']

// object used to store some data useful to read info from one level to another
const memory = {}

const adminExpressDirs = [
  'ADE-COG_1-0_SHP_LAMB93_FR',
  'ADE-COG_1-0_SHP_RGM04UTM38S_D976',
  'ADE-COG_1-0_SHP_RGR92UTM40S_D974',
  'ADE-COG_1-0_SHP_UTM20W84GUAD_D971',
  'ADE-COG_1-0_SHP_UTM20W84MART_D972',
  'ADE-COG_1-0_SHP_UTM22RGFG95_D973'
]

const irisDirs = [
  'CONTOURS-IRIS_2-1_SHP_LAMB93_FXX-2017',
  'CONTOURS-IRIS_2-1_SHP_RGM04UTM38S_MYT-2017',
  'CONTOURS-IRIS_2-1_SHP_RGR92UTM40S_REU-2017',
  'CONTOURS-IRIS_2-1_SHP_RGSPM06U21_SPM-2017',
  'CONTOURS-IRIS_2-1_SHP_UTM20W84GUAD_GLP-2017',
  'CONTOURS-IRIS_2-1_SHP_UTM20W84MART_MTQ-2017',
  'CONTOURS-IRIS_2-1_SHP_UTM22RGFG95_GUF-2017'
]

exports.years = {
  2017: {
    urls: {
      adminExpress: 'https://wxs.ign.fr/x02uy2aiwjo9bm8ce5plwqmr/telechargement/prepackage/ADMINEXPRESS-COG-PACK_2017-07-07%24ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/file/ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19.7z',
      iris: 'ftp://Contours_IRIS_ext:ao6Phu5ohJ4jaeji@ftp3.ign.fr/CONTOURS-IRIS_2-1__SHP__FRA_2017-01-01.7z'
    },
    paths: {
      region: adminExpressDirs.map(dir => `ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2017-06-19/${dir}/REGION.shp`),
      departement: adminExpressDirs.map(dir => `ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2017-06-19/${dir}/DEPARTEMENT.shp`),
      epci: adminExpressDirs.map(dir => `ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2017-06-19/${dir}/EPCI.shp`),
      commune: adminExpressDirs.map(dir => `ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19/ADMIN-EXPRESS-COG/1_DONNEES_LIVRAISON_2017-06-19/${dir}/COMMUNE.shp`),
      iris: irisDirs.map(dir => `CONTOURS-IRIS_2-1__SHP__FRA_2017-01-01/CONTOURS-IRIS/1_DONNEES_LIVRAISON_2018-06-00105/${dir}/CONTOURS-IRIS.shp`)
    },
    mappings: {
      region: (props) => {
        const id = `reg-2017-${props.INSEE_REG}`
        memory[id] = props.NOM_REG
        return {
          id,
          properties: {
            niveau: 'région',
            ...props,
            ID: undefined
          }
        }
      },
      departement: (props) => {
        return {
          id: `dep-2017-${props.INSEE_DEP}`,
          properties: {
            niveau: 'département',
            ...props,
            NOM_REG: memory[`reg-2017-${props.INSEE_REG}`],
            ID: undefined
          }
        }
      },
      epci: (props) => {
        const id = `epci-2017-${props.CODE_EPCI}`
        memory[id] = { NOM_EPCI: props.NOM_EPCI, TYPE_EPCI: props.TYPE_EPCI }
        return {
          id,
          properties: {
            niveau: 'EPCI',
            ...props,
            ID: undefined
          }
        }
      },
      commune: (props) => {
        const epci = memory[`epci-2017-${props.CODE_EPCI}`]
        return {
          id: `com-2017-${props.INSEE_COM}`,
          properties: {
            niveau: 'commune',
            ...props,
            ...epci,
            ID: undefined,
            NOM_COM_M: undefined
          }
        }
      },
      iris: (props) => {
        return {
          id: `iris-2017-${props.CODE_IRIS}`,
          properties: {
            ...props
          }
        }
      }
    }
  }
  /* 2018: {
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
  } */
}
