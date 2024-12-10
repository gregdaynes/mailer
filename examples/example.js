import Path from 'node:path'
import Fastify from "fastify"

const fastify = Fastify({
  logger: {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }
})

const opts = {
  //mailerDataPath: './db.sqlite3'
}

fastify.register(import(Path.join(import.meta.dirname, '..', 'index.js')), opts)

fastify.addHook('onRequest', async (request, reply) => {
  request.notify = fastify.mailer(request)
})

fastify.get('/', async (request, reply) => {
  try {
    const [success, { message, nonce }] = request.notify({
      nonce: 'abc123' + new Date(),
      to: 'alice@example.com',
      from: 'bob@example.com',
      subject: 'Example notification',
      template: 'Hi, ${name}!',
      data: {
        name: 'Alice'
      },
    })

    request.notify({
      nonce: 'abc456' + new Date(),
      to: 'bob@example.com',
      from: 'alice@example.com',
      subject: 'Example notification',
      template: 'Hey ${name}!',
      data: {
        name: 'Bob'
      },
    })

    fastify.log.info({ success, nonce }, message)
  } catch (err) {
    request.log.error(err)
    return reply.status(400).send('Error')
  }

  return reply.send('ok')
})

fastify.listen({ port: 3000 }, err => {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})
