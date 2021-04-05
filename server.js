// Getting enviroment variables from .env file
require('dotenv').config();

// Dependencies
const express = require("express"),
      formidableMiddleware = require('express-formidable'),
      cors = require('cors'),
      bcrypt = require('bcrypt'),
      mongoose = require('mongoose'),
      bodyParser = require('body-parser'),
      PORT = process.env.PORT || 8080,
      PYTHON_ENDPOINT = process.env.PYTHON_ENDPOINT,
      DB_ENDPOINT = process.env.DB_ENDPOINT,
      fs = require('fs'),
      { s3GetParams, s3Submit } = require('./utils/s3')
      sharpIt = require('./utils/sharper'),
      Organization = require('./model/organization'),
      User = require('./model/user'),
      Project = require('./model/project'),
      Hole = require('./model/hole'),
      S3object = require('./model/s3object'),
      axios = require('axios'),
      AdminBro = require('admin-bro'),
      AdminBroExpressjs = require('admin-bro-expressjs')

// Express server definition
const app = express()

// formidable Middleware
app.use(formidableMiddleware({ multiples: true }))

// Configuring express to handle all requests 
app.use((req, res, next) => {
  // authorized headers for preflight requests
  // https://developer.mozilla.org/en-US/docs/Glossary/preflight_request
  res.header('Access-Control-Allow-Origin', '*');

  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Content-Length, Accept');
  next();

  app.options('*', (req, res) => {
      // allowed XHR methods  
      res.header('Access-Control-Allow-Methods', 'GET, PATCH, PUT, POST, DELETE, OPTIONS');
      res.send();
  });
});

// Custom middlewares

// DEFAULT GET
app.get('/api',  (req, res) => res.status(200).send('array of colors (numbers) missing.'))

// authenticating users
app.post('/api/login', async (req, res) => {
  const { email, password } = req.fields

  try {
    const user = await User.findOne({ email })
    if(user) {
     // const matched = await bcrypt.compare(password, user._doc.encryptedPassword)
     const matched = password === user._doc.password
      //user._doc.encryptedPassword = null
      if (matched) {
        const org = await Organization.findOne({ members: user._doc._id })
          .populate([
            { path: 'members' },
            { path: 'projects', populate: { path: 'holes', populate: ['tiled_core'] }}
          ])
        if(org) return res.send({ user, organization: org })
        return res.send({ user })
      }
    }
    return res.sendStatus(403)
  } catch (error) {
    console.log(error)
    return res.sendStatus(500)
  }
})

// get organization
app.get('/api/organization/:id', async (req, res) => {
  const { id } = req.params

  Organization.findById(id).populate([
    { path: 'members' },
    { path: 'projects', populate: { path: 'holes', populate: ['tiled_core'] }}
  ]).then(response => {
    res.send(response)
  }).catch(err => {
    console.log(err)
  })
})

// create organization
app.post('/api/organization/:id', async (req, res) => {
  const { id } = req.params
  const { orgName } = req.fields

  const org = await Organization.create({ name: orgName })
  const user = await User.findOne({ _id: id })
  org.members = [...org.members, user]
  org.save()
  res.send(org)
})

// find or request cluster model
app.get('/api/target', async (req, res) => {
  const { hole_id, colors, min, max, border } = req.query,
        sorted = colors.split(',').sort((a, b) => a - b).toString()
        query = `colors=${sorted}&min=${min}&max=${max}&border=${border}`,
        colorArr = sorted.split(',')

  try {
    const cluster = await S3object.findOne({ type:'cluster', query: query, isTiled: true }), arr = []
    if(cluster) {
      if(cluster.url) return res.send(cluster)
      if(cluster.status === 'pending') return res.send('This request has already been issued and is in the process of being created')
    } else {
      const request = await S3object.create({ type: 'cluster', query, status: 'pending' })
      if(colorArr.length > 1) {
        for(color of colorArr) {
          const _query = `colors=${color}&min=${min}&max=${max}&border=${border}`,
                img = await S3object.findOne({ type: 'cluster', query: _query, isTiled: true, status: 'saved' })
  
          if(img) {
            arr.push({ color, url: img.get('url') })
          } else {
            const request = await S3object.create({ type: 'cluster', query: _query, status: 'pending' })
          }
        }
      }

      reqPythonForCluster(query, arr, hole_id)
    }
  } catch (err) {
    console.log(err)
    return res.status(500).json(err)
  }
  return res.send('Your request is being processed, please wait.')
})

// find or request graph
app.get('/api/graph', async (req, res) => {
  const { hole_id, column } = req.query,
          query = `column=${column}`

  try {
    const graph = await S3object.findOne({ type:'graph', query: query, isTiled: true }), arr = []
    if(graph) {
      if(graph.url) return res.send(graph)
      if(graph.status === 'pending') return res.send('This request has already been issued and is in the process of being created')
    } else {
      const request = await S3object.create({ type: 'graph', query, status: 'pending' })

      reqPythonForGraph(query, hole_id)
    }
  } catch (err) {
    console.log(err)
    return res.status(500).json(err)
  }
  return res.send('Your request is being processed, please wait.')
})

// upload cluster generated by python
app.post('/api/upload/cluster/:id', async (req, res) => {
  try {
    const files = req.files.file instanceof Array ? req.files.file : [req.files.file]
    const { sharp, query } = req.fields, { id } = req.params
    let hole = await Hole.findById(id)

    files
      .sort((a, b) => a.size - b.size)
      .forEach(async file => {
        const params = await s3GetParams(file.path),
              fileName = file.name.split('.')[0].replace(' ', '_')
              submit = await s3Submit(params)

        const cluster = await S3object.create({
          name: fileName,
          type: 'cluster',
          query,
          url: submit.url,
          status: submit.status
        })

        hole.clusters = [...hole.clusters, cluster]

        if(sharp === 'true') {
          const sharpRes = await sharpIt(file, true)

          const tiled_cluster = await S3object.create({
            name: fileName,
            type: 'cluster',
            query,
            url: sharpRes.url,
            status: sharpRes.status,
            isTiled: true
          })

          hole.clusters = [...hole.clusters, tiled_cluster]
        }
        
        hole.save()
      })
      return res.sendStatus(200)
  } catch (err) {
    console.log(err)
    return res.status(500).json(err)
  }
})

// upload graph generated by python
app.post('/api/upload/graph/:id', async (req, res) => {
  try {
    const files = req.files.file instanceof Array ? req.files.file : [req.files.file]
    const { sharp, query } = req.fields, { id } = req.params
    let hole = await Hole.findById(id)

    files
      .sort((a, b) => a.size - b.size)
      .forEach(async file => {
        const params = await s3GetParams(file.path),
              fileName = file.name.split('.')[0].replace(' ', '_')
              submit = await s3Submit(params)

        const graph = await S3object.create({
          name: fileName,
          type: 'graph',
          query,
          url: submit.url,
          status: submit.status
        })

        hole.graphs = [...hole.graphs, graph]

        if(sharp === 'true') {
          const sharpRes = await sharpIt(file, true)

          const tiled_graph = await S3object.create({
            name: fileName,
            type: 'graph',
            query,
            url: sharpRes.url,
            status: sharpRes.status,
            isTiled: true
          })

          hole.graphs = [...hole.graphs, tiled_graph]
        }
        
        hole.save()
      })
      return res.sendStatus(200)
  } catch (err) {
    console.log(err)
    return res.status(500).json(err)
  }
})

// upload multiple files to a project
app.post('/api/upload/:project_id/:hole_id', async (req, res) => {
  try {
    const files = req.files.file instanceof Array ? req.files.file : [req.files.file]
    const { name, sharp, query, section, tags } = req.fields, { project_id, hole_id } = req.params
    const project = await Project.findById(project_id).populate({
      path: 'holes',
      select: 'id tiled_core spreadsheets',
      populate: [
        { path: 'tiled_core' },
        { path: 'spreadsheets' },
        { path: 'graphs' }
      ]
    })
    let hole = hole_id !== "none" ? await Hole.findById(hole_id) : await Hole.create({})

    let spreadsheets = []

    files
      .sort((a, b) => a.size - b.size)
      .forEach(async file => {
        const ext = file.name.split('.')[1],
              params = await s3GetParams(file.path),
              fileName = file.name.split('.')[0].replace(' ', '_')
              submit = await s3Submit(params)

        if(ext === 'csv') {
          const spreadsheet = await S3object.create({
            name: fileName,
            type: 'spreadsheet',
            url: submit.url,
            status: submit.status,
          })
          spreadsheets.push(spreadsheet)
          return;
        }

        const core_image = await S3object.create({
          name: fileName,
          type: 'core',
          url: submit.url,
          status: submit.status
        })

        hole.core = core_image
        hole.name = name && name
        hole.section = section && section
        hole.tags = tags ? tags.split(',') : ''
        hole.spreadsheets = spreadsheets

        if(sharp === 'true') {
          const sharpRes = await sharpIt(file, true)

          const tiled_core = await S3object.create({
            name: fileName,
            type: 'core',
            url: sharpRes.url,
            status: sharpRes.status,
            isTiled: true
          })

          hole.tiled_core = tiled_core

          // fs.rmdir('tiled_images', { recursive: true }, (err) => {
          //   if(err) {
          //     console.log(err)
          //   }

            // console.log('dir cleaned up!');
          // })
        }
        hole.save()
        reqPythonForGraph(query, hole._id)
        
        const _index = project.holes.findIndex(f => f._id.toString() === hole._id.toString())
        if(_index !== -1) {
          const _holes = [...project.holes]
          _holes.splice(_index, 1, hole)
          project.holes = [..._holes]
        } else {
          project.holes = [...project.holes, hole]
        }

        project.save()
      })
      return res.send(project)
  } catch (err) {
    console.log(err)
    return res.status(500).json(err)
  }
})

app.get('/api/projects/', (req, res) => {
  Project.find()
  .populate([
    { path: 'members', select: 'email' },
    { path: 'holes', select: 'section' } 
  ]).then(response => {
      res.status(200).send(response)
    }).catch(err => {
      res.sendStatus(500)
    })
})

app.post('/api/project/:id', async (req, res) => {
  const { id } = req.params
  const { name } = req.fields
  const files = req.files

  const organization = await Organization.findOne({ _id: id })

  Project.create({ name })
    .then(response => {
      organization.projects = [...organization.projects, response]
      organization.save()
      if(files !== undefined) {
        res.redirect(307, `/api/upload/${response._id}/none`)
      } else {
        res.send(response)
      }
    }).catch(err => {
      res.sendStatus(500)
    })
})

app.get('/api/project/:id', (req, res) => {
  const { id } = req.params

  Project.findById(id)
    .populate({ path: 'holes', select: 'name tiled_core spreadsheets graphs', populate: [
      { path: 'tiled_core' },
      { path: 'spreadsheets' },
      { path: 'graphs' }
    ]})
    .then(response => {
      res.status(200).send(response)
    }).catch(err => {
      res.sendStatus(500)
    })
})

app.put('/api/project/:id', (req, res) => {
  const { id } = req.params
  const { position } = req.fields

  Project.findOneAndUpdate({ _id: id }, { coordinates: position }, {new: true})
    .populate({ path: 'holes', select: 'tiled_core', populate: [{ path: 'tiled_core' }, { path: 'spreadsheets' }] })
    .then(response => {
      res.send(response)
    }).catch(err => {
      res.sendStatus(500)
    })
})

app.get('/api/drillhole/:id', async (req, res) => {
  const { id } = req.params

  Image.findById(id)
    .then(response => {
      res.status(200).send(response)
    }).catch(err => {
      res.send(err)
    })
})

app.post('/api/drillhole/:id', async (req, res) => {
  const { id } = req.params
  const { name } = req.fields
  const files = req.files

  const project = await Project.findOne({ _id: id })

  Hole.create({ name })
    .then(response => {
      project.holes = [...project.holes, response]
      project.save()
      if(files !== undefined) {
        res.redirect(307, `/api/upload/${project._id}/${response._id}`)
      } else {
        res.send(response)
      }
    }).catch(err => {
      res.sendStatus(500)
    })
})

app.get('/api/colours/:id', (req, res) => {
  const { id } = req.params

  Hole.findById(id)
    .populate('spreadsheets')
    .then(async response => {
      const match = response.spreadsheets.find(f => f.name.includes('color')),
            csvPath = match ? match.url : 'https://rttm-s3.s3.us-east-2.amazonaws.com/f29e92150ca46ed3dd6dcce2aa46b7fc',
            file = await axios(csvPath),
            data = file.data,
            arr = formatColours(data)

      res.send(arr.sort())
    })
    .catch(err => {
      res.sendStatus(500)
    })
})

// We have to tell AdminBro that we will manage mongoose resources with it
AdminBro.registerAdapter(require('admin-bro-mongoose'))

// formidable Middleware
// app.use(formidableMiddleware())

// RBAC functions
const canModifyUsers = ({ currentAdmin }) => currentAdmin && currentAdmin.role === 'admin'

// Pass all configuration settings to AdminBro
const adminBro = new AdminBro({
  resources: [{
    resource: User,
    options: {
      properties: {
        encryptedPassword: { isVisible: false },
        password: {
          type: 'string',
          isVisible: {
            list: false, edit: true, filter: false, show: false,
          },
        },
      },
      actions: {
        edit: { isAccessible: canModifyUsers },
        delete: { isAccessible: canModifyUsers },
        new: {
          isAccessible: canModifyUsers,
          before: async (request) => {
            if(request.payload.password) {
              request.payload = {
                ...request.payload,
                encryptedPassword: await bcrypt.hash(request.payload.password, 10),
                password: undefined,
              }
            }
            return request
          },
        },
      }
    }
  },
  {
    resource: S3object
  },
  {
    resource: Organization
  },
  {
    resource: Hole
  },
  {
    resource: Project
  }],
  rootPath: '/admin',
})

// Build and use a router which will handle all AdminBro routes
// const router = AdminBroExpressjs.buildRouter(adminBro)
const router = AdminBroExpressjs.buildAuthenticatedRouter(adminBro, {
  authenticate: async (email, password) => {
    const user = await User.findOne({ email })
    if (user) {
      const matched = await bcrypt.compare(password, user._doc.encryptedPassword)
      if (matched) {
        return user
      }
    }
    return false
  },
  cookiePassword: 'some-secret-password-used-to-secure-cookie',
})

app.use(adminBro.options.rootPath, router)

// Running the server
const run = async () => {
  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false
  }

  try {
    await mongoose.connect(DB_ENDPOINT, options)
    const server = await app.listen(PORT, _ => {console.log('server listening on port: ' + PORT)})
    server.setTimeout(400000)
    
  } catch (error) {
    console.log(error)
  }

}

run()

app.use(cors())
// app.use(bodyParser.urlencoded({ extended: true }))
// app.use(bodyParser.json())

// CUSTOM FUNCTIONS

// Request to python API
function reqPythonForCluster(query, urls, hole_id) {
  let array = 'None';
  urls.forEach(a => {
    if(a) {
      array = ''
      array += `c=${a.color}|u=${a.url}&`
    }
  })

  try {
    return axios(`${PYTHON_ENDPOINT}/cluster/${query}/${array}/${hole_id}`, { responseType: 'arraybuffer' })
  } catch (err) {
    console.log(err)
  }
}

function reqPythonForGraph(query, hole_id) {
  try {
    query = query ? query : 'None'
    return axios(`${PYTHON_ENDPOINT}/graph/${query}/${hole_id}`, { responseType: 'arraybuffer' })
  } catch (err) {
    console.log(err)
  }
}

function formatColours(str) {
  const data = str.split('\r\n'), arr = []
  data[data.length - 1] === '' && data.splice([data.length - 1], 1)
  for([idx, value] of data.entries()) {
    const v = value.replace('\ufeff', '')
    arr.push(v.replace(idx + ',', ''))
  }
  return arr
}

function formatInterpolatedData(str) {
  var strLines = str.split(/\r\n|\n/);
  var headers = strLines[0].split(',');
  var lines = [];

  for (var i=1; i<strLines.length; i++) {
      var data = strLines[i].split(',');
      if (data.length == headers.length) {

          var tarr = [];
          for (var j=0; j<headers.length; j++) {
              tarr.push(headers[j]+":"+data[j]);
          }
          lines.push(tarr);
      }
  }
  return lines
}