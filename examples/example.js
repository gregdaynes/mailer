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
  mailerDataPath: ':memory:'
}

fastify.register(import(Path.join(import.meta.dirname, '..', 'index.js')), {
  ...opts,
  transport: {
    host: process.env.MAILER_TRANSPORT_HOST,
    port: process.env.MAILER_TRANSPORT_PORT,
    auth: {
      user: process.env.MAILER_TRANSPORT_USER,
      pass: process.env.MAILER_TRANSPORT_PASS
    }
  }
})

fastify.addHook('onRequest', async (request, reply) => {
  request.notify = fastify.mailer(request)
})

fastify.get('/', async (request, reply) => {
  try {
    const [success, { message, nonce }] = request.notify({
      nonce: 'abc123' + request.id,
      to: 'alice@example.com',
      from: 'bob@example.com',
      fromName: "Bob",
      subject: 'Example notification',
      template: 'Hi, ${name}!',
      data: {
        name: 'Alice'
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
