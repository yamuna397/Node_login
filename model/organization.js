// Dependencies
const mongoose = require('mongoose')

const Organization = mongoose.model('Organization', {
  name: { type: String, required: true },
  description: { type: String },
  projects: [{
    type: mongoose.Types.ObjectId,
    ref: 'Project'
  }],
  members: [{
    type: mongoose.Types.ObjectId,
    ref: 'User'
  }],
})

module.exports = Organization