import fp from 'fastify-plugin'
import Ajv from 'ajv'
import connect, { sql } from '@databases/sqlite-sync'
import splitQuery from '@databases/split-sql-query'
import migrations from './migrations.js'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events';

EventEmitter.captureRejections = true;
const EventBus = new EventEmitter();

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
  const db = connect(opts?.mailerDataPath || ':memory:');
  runMigrations(db)

  EventBus.on('created', async function (msg) {
    fastify.log.info({ event: 'created', msg }, 'Notification event');
    handleCreated(db)
  });

  EventBus.on('prepared', async function (msg) {
    fastify.log.info({ event: 'prepared', msg }, 'Notification event');
    handlePrepared(db)
  });

  EventBus.on('sent', async function (msg) {
    fastify.log.info({ event: 'sent', msg }, 'Notification event');
  });

  EventBus.on('error', function (msg) {
    fastify.log.error({ event: 'error', msg }, 'Notification event encountered an error')
  })

  fastify.decorate('mailer', function init (request) {
    return notify.bind(this, request, db)
  })
},
{
  name: 'notifications'
})

function runMigrations (db) {
  db.tx(tx => {
    try {
      for (const migration of splitQuery(migrations)) {
        tx.query(migration)
      }
    } catch (err) {
      throw new Error('Error running migrations.', { cause: err })
    }
  });
}

function notify (request, db, args) {
  const validate = ajv.compile(schema)

  const valid = validate(args)
  if (!valid) {
    fastify.log.error({ errors: validate.errors })
    throw new Error('Validation error', { cause: validate.errors[0] })
  }

  request.log.debug(args, 'notify() called with arguments')

  const { nonce, to, from, subject, template, data } = args

  // check nonce doesn't exist in store already
  const [existingNonce] = db.query(sql`SELECT * FROM notifications WHERE nonce = ${nonce}`)
  if (existingNonce) {
    request.log.info({ nonce }, 'Notification already exists')

    return [false, {
      message: 'Notification already exists for nonce.',
      nonce,
    }]
  }

  // write to notifications table
  db.query(sql`
    INSERT INTO notifications (
      id_notification, nonce, sender,
      recipient, subject, template,
      data, created, id_request
    ) VALUES (
      ${randomUUID()}, ${nonce}, ${from},
      ${to}, ${subject}, ${template},
      ${JSON.stringify(data)}, ${(new Date()).toISOString()}, ${request.id}
    )`
  )

  EventBus.emit('created', { nonce })

  return [true, {
    message: 'Notification added to queue',
    nonce,
  }]
}

function handleCreated (db) {
  const notifications = db.query(sql`SELECT * FROM notifications WHERE preparing IS NULL AND prepared IS NULL AND sending IS NULL AND sent IS NULL`)

  if (!notifications.length) return

  for (const notification of notifications) {
    db.query(sql`UPDATE notifications SET preparing = ${(new Date()).toISOString()} WHERE id_notification = ${notification.id_notification}`)

    const preparedNotification = createNotification(notification.template, JSON.parse(notification.data))
    db.query(sql`UPDATE notifications SET prepared = ${(new Date()).toISOString()}, notification = ${preparedNotification} WHERE id_notification = ${notification.id_notification}`)
  }

  EventBus.emit('prepared', notifications.map(n => n.nonce))
}

function createNotification (template, data) {
  return template.replace(/\${(.*?)}/g, (_x,g)=> data[g]);
}

function handlePrepared(db) {
  const notifications = db.query(sql`SELECT * FROM notifications WHERE prepared IS NOT NULL and notification IS NOT NULL AND sending IS NULL AND sent IS NULL`)
  if (!notifications.length) return

  for (const notification of notifications) {
    db.query(sql`UPDATE notifications SET sending = ${(new Date()).toISOString()} WHERE id_notification = ${notification.id_notification}`)

    // send the notification
    //console.info('Sending notification', { notification: notification.notification })
    //console.info('Notification sent')
    const response = JSON.stringify({ status: 'ok' })

    db.query(sql`UPDATE notifications SET sent = ${(new Date()).toISOString()}, response = ${response} WHERE id_notification = ${notification.id_notification}`)

    EventBus.emit('sent', { nonce: notification.nonce })
  }
}
