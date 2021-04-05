// Dependencies
const mongoose = require('mongoose')

const Project = mongoose.model('Project', {
  name: { type: String, required: true },
  holes: [{
    type: mongoose.Types.ObjectId,
    ref: 'Hole'
  }],
  coordinates: { type: Object, required: false }
})

module.exports = Project
