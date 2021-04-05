// Dependencies
const AdmZip = require('adm-zip'),
      ROOT_DIR = process.env.ROOT_DIR || './tmp',
      path = require('path'),
      fs = require('fs'),
      { readDir, getDirContent } = require('./reader')

const getZipContent = async zipPath => {
  const zip = new AdmZip(`${zipPath}.zip`), result = [];
  let childs = [];
  zip.extractAllTo(`${ROOT_DIR}/`, true)

  const files = await readDir(zipPath)

  for(file of files) {
    const filePath = path.join(zipPath, file),
          isDir = fs.lstatSync(filePath).isDirectory()
  
    if(!isDir){
      result.push({ name: file, path: filePath, isDir, subFiles: childs })
    } else {
      childs = await getDirContent(filePath)
      result.push({ name: `${filePath.split('\\')[1]}_files`, path: filePath, isDir, subFiles: childs })
    }
  }
  console.log('Server message: zip file has been successfully extracted')
  return result
}

module.exports = { getZipContent }