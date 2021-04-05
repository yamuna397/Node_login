// Dependencies
const mongoose = require('mongoose')

const User = mongoose.model('User', {
  email: { type: String, required: true },
  username: { type: String, required: false },
  role: { type: String, enum: ['admin', 'restricted'], required: true },
  encryptedPassword: { type: String, required: true }
})

module.exports = User
