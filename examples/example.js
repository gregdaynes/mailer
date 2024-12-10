import Path from 'node:path'
import Fastify from "fastify"

const fastify = Fastify({ logger: true })

const opts = {

}
fastify.register(import(Path.join(import.meta.dirname, '..', 'index.js'), opts))

fastify.listen({ port: 3000 }, err => {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})
