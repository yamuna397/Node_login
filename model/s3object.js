// Dependencies
const mongoose = require('mongoose')

const S3object = mongoose.model('S3object', {
  name: { type: String, required: false },
  type: { type: String, enum: ['core', 'cluster', 'spreadsheet', 'graph'], required: true },
  url: { type: String, required: false },
  query: { type: String, required: false },
  status: { type: String, enum: ['saved', 'failed', 'pending'] },
  isTiled: { type: Boolean, default: false }
})

module.exports = S3object