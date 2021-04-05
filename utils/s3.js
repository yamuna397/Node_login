// Dependencies
const AWS = require('aws-sdk'),
      FileType = require('file-type'),
      { readFile } = require('./reader')

//setting the credentials
//The region should be the region of the bucket that you created
//Visit this if you have any confusion - https://docs.aws.amazon.com/general/latest/gr/rande.html
AWS.config.update({
  accessKeyId: 'AKIAJ4EB6FNXEG7CXB5Q',
  secretAccessKey: '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',
  region: 'us-east-2',
});

//Creating a new instance of S3:
const s3 = new AWS.S3();

const s3GetParams = async key => {
  const buffer = await readFile(key),
        type = await FileType.fromBuffer(buffer)

  let _key = key.replace(/\\/g, '/')
  _key = _key.split('upload_')[1] === undefined ? _key : _key.split('upload_')[1]

  return {
    Bucket: 'rttm-s3',
    Key: _key,
    ACL: 'public-read',
    Body: buffer,
    ContentType: type ? type.mime : 'application/vnd.ms-excel'
  }
}

const saveIntoS3 = async obj => {
  let params, arr = [], json = { status: 'saved' };

  console.log('Server message: the files are being uploaded')

  for(o of obj) {
    if(!o.isDir) {
      params = await s3GetParams(o.path)
      const data = await s3Submit(params)
      if(data.url.includes('.dzi')) json.url = data.url
      arr.push(data)
    } else {
      for(child of o.subFiles) {
        params = await s3GetParams(child.path)
        const data = await s3Submit(params)
        arr.push(data)
      }
    }
  }

  const missed = arr.filter(f => f.status === 'failed'),
        result = arr.length * 100 / arr.filter(f => f.status === 'saved').length
  json.status = result === 100 ? 'saved' : 'failed'

  console.log('Server message: Success rate: ' + result + '%' + ' status: ' + json.status)

  return await { ...json, missing: missed }
}

const s3Submit = async params => {
  // upload file to S3
  const s3Response = await s3.putObject(params).promise(),
        data = {
          name: params.Key.split('.')[0],
          url: `https://${params.Bucket}.s3.us-east-2.amazonaws.com/${params.Key}`,
          status: s3Response.error ? 'failed' : 'saved'
        }
  s3Response.error ? console.log('Server message: image upload failed') : console.log('Server message: image successfully uploaded')

  return data
}

module.exports = { s3Submit, s3GetParams, saveIntoS3 }