import fp from 'fastify-plugin'
import Ajv from 'ajv'
import connect, { sql } from '@databases/sqlite-sync'
import splitQuery from '@databases/split-sql-query'
import migrations from './migrations.js'

const ajv = new Ajv({
  removeAdditional: 'all',
  useDefaults: true,
  coerceTypes: 'array',
})

const schema = {
  $id: 'mailer:create',
  type: 'object',
  properties: {
    nonce: {
      type: 'string'
    },
    to: {
      type: 'string',
      format: 'email'
    },
    from: {
      type: 'string',
      format: 'email',
    },
    subject: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
    },
    template: {
      type: 'string',
    },
    data: {
      type: 'object',
    }
  },
  required: [
    'nonce',
    'to',
    'from',
    'subject',
    'template',
    'data'
  ]
}

export default fp(function async (fastify, opts) {
  const db = connect(opts.mailerDataPath);

  db.tx(tx => {
    try {
      for (const migration of splitQuery(migrations)) {
        tx.query(migration)
      }
    } catch (err) {
      throw new Error('Error running migrations.', { cause: err })
    }
  });

  fastify.decorateRequest('mailer', function (args) {
    const validate = ajv.compile(schema)

    const valid = validate(args)
    if (!valid) {
      fastify.log.error({ errors: validate.errors })
      throw new Error('Validation error', { cause: validate.errors[0] })
    }

    fastify.log.debug(args, 'arguments passed to function')
  })
},
{
  name: 'notifications'
})
