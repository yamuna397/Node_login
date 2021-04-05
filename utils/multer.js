// Dependencies
const multer = require('multer'),
      { v4: uuidv4 } = require('uuid'),
      fs = require('fs');

// Instantiated multer to handle multipart/form-data (files)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
  const dir = './images'
  !fs.existsSync(dir) && fs.mkdirSync(dir);
  cb(null, 'images')
},
  filename: function (req, file, cb) {
    const end = file.mimetype ? file.mimetype.split('/')[1] :file.originalname.split('.')[1]
    cb(null, `${uuidv4()}.${end}`)
  }
})

const upload = multer({ storage: storage }).array('file')

module.exports = { upload, multer }