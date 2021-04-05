// Dependencies
const sharp = require('sharp'),
      ROOT_DIR = process.env.ROOT_DIR || './tmp',
      { v4: uuidv4 } = require('uuid'),
      { getZipContent } = require('./zipper'),
      { saveIntoS3 } = require('./s3')

const sharpIt = (img, upload = false) => {
  const isBuffer = Buffer.isBuffer(img),
        path = `${ROOT_DIR}/${uuidv4()}`

  return sharp(isBuffer ? img : img.path)
  .png()
  .tile({
    size: 768,
    container: 'zip'
  })
  .toFile(path)
  .then(async _ => {
    console.log('Server message: tiling process successfully completed')
    console.log('Server message: zip file saved on: ' + path)
    if(upload) {
      // Extract zip containing tiled images
      const content = await getZipContent(path)
      return await saveIntoS3(content)
    }
  })
  .catch(err => {
    console.log('Server message: tiling process failed')
    console.log('Error: ' + err)
  })
}

module.exports = sharpIt