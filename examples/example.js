import Path from 'node:path'
import Fastify from "fastify"

const fastify = Fastify({ logger: { level: 'debug' } })

const opts = {

}
fastify.register(import(Path.join(import.meta.dirname, '..', 'index.js'), opts))

fastify.get('/', async (request, reply) => {
  try {
    request.mailer({
      nonce: 'abc123',
      to: 'alice@example.com',
      from: 'bob@example.com',
      subject: 'Example notification',
      template: 'Hi, ${name}!',
      data: {
        name: 'Alice'
      },
    })
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
