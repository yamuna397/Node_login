// Dependencies

const { promisify } = require('util'),
      path = require('path'),
      readFile = promisify(require('fs').readFile),
      readDir = promisify(require('fs').readdir);

const getDirContent = async dir => {
  const dirs = await readDir(dir),
        result = []

  for(d of dirs) {
    // get the full path of the file
    const dirPath = path.join(dir, d),
          files = await readDir(dirPath)
  
    for(file of files) {
      const filePath = path.join(dirPath, file)
      result.push({ name: file, path: filePath })
    }
  }

  return result
}

module.exports = { readFile, readDir, getDirContent }