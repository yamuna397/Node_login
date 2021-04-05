// Dependencies
const mongoose = require('mongoose')

const Hole = mongoose.model('Hole', {
  name: {type: String, required: false },
  core: {
    type: mongoose.Types.ObjectId,
    ref: 'S3object'
  },
  tiled_core: {
    type: mongoose.Types.ObjectId,
    ref: 'S3object'
  },
  clusters: [{
    type: mongoose.Types.ObjectId,
    ref: 'S3object',
  }],
  spreadsheets: [{
    type: mongoose.Types.ObjectId,
    ref: 'S3object',
  }],
  graphs: [{
    type: mongoose.Types.ObjectId,
    ref: 'S3object',
  }],
  section: { type: String, required: false },
  // depth: { type: String, required: false },
  tags: [{ type: String, required: false }],
})

module.exports = Hole