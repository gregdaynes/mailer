import fp from 'fastify-plugin'
import Ajv from 'ajv'
import connect, { sql } from '@databases/sqlite-sync'
import splitQuery from '@databases/split-sql-query'
import migrations from './migrations.js'
import { EventEmitter } from 'node:events';
import nodemailer from 'nodemailer'
import hyperId from 'hyperid'

function debounce() {
  let timer;

  return function (func, time = 100) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(func, time);
  }
}

const generateId = hyperId()

EventEmitter.captureRejections = true;
const EventBus = new EventEmitter();

const createdEvent = debounce()
const preparedEvent = debounce()

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
    fromName: {
      type: 'string',
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

const transportSchema = {
  $id: 'mailer:transport',
  type: 'object',
  properties: {
    host: {
      type: 'string',
    },
    port: {
      type: 'string',
    },
    auth: {
      type: 'object',
      properties: {
        user: {
          type: 'string'
        },
        pass: {
          type: 'string'
        }
      },
      required: ['user', 'pass']
    }
  },
  requried: ['host', 'port']
}

export default fp(function async (fastify, opts) {
  const db = connect(opts?.mailerDataPath || ':memory:');
  if (opts.mailerDataPath && opts.mailerDataPath !== ':memory:') {
    db.query(sql`PRAGMA journal_mode = WAL`)
    db.query(sql`PRAGMA synchronous = OFF`)
    db.query(sql`PRAGMA page_size = 65536`)
  }

  runMigrations(db)

  const validate = ajv.compile(transportSchema)
  const valid = validate(opts.transport)
  if (!valid) {
    fastify.log.error({ errors: validate.errors })
    throw new Error('Validation error', { cause: validate.errors[0] })
  }

  const mailer = nodemailer.createTransport({ ...opts.transport });

  EventBus.on('created', async function (msg) {
    fastify.log.info({ event: 'created', msg }, 'Notification event');
    handleCreated(db)
  });

  EventBus.on('prepared', async function (msg) {
    fastify.log.info({ event: 'prepared', msg }, 'Notification event');
    handlePrepared(db, mailer)
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

  const { nonce, to, from, fromName, subject, template, data } = args

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
      id_notification, nonce, sender, sender_name,
      recipient, subject, template,
      data, created, id_request
    ) VALUES (
      ${generateId()}, ${nonce}, ${from}, ${fromName},
      ${to}, ${subject}, ${template},
      ${JSON.stringify(data)}, ${(new Date()).toISOString()}, ${request.id}
    )`
  )

  createdEvent(() => EventBus.emit('created', { nonce }))

  return [true, {
    message: 'Notification added to queue',
    nonce,
  }]
}

function handleCreated (db) {
  const notifications = db.query(sql`SELECT * FROM notifications WHERE preparing IS NULL`)

  if (!notifications.length) return

  for (const notification of notifications) {
    db.query(sql`UPDATE notifications SET preparing = ${(new Date()).toISOString()} WHERE id_notification = ${notification.id_notification}`)

    const preparedNotification = createNotification(notification.template, JSON.parse(notification.data))
    db.query(sql`UPDATE notifications SET prepared = ${(new Date()).toISOString()}, notification = ${preparedNotification} WHERE id_notification = ${notification.id_notification}`)
  }

  preparedEvent(() => EventBus.emit('prepared', notifications.map(n => n.nonce)))
}

function createNotification (template, data) {
  return template.replace(/\${(.*?)}/g, (_x,g)=> data[g]);
}

async function handlePrepared(db, mailer) {
  const notifications = db.query(sql`SELECT * FROM notifications WHERE prepared IS NOT NULL`)
  if (!notifications.length) return

  for (const notification of notifications) {
    db.query(sql`UPDATE notifications SET sending = ${(new Date()).toISOString()} WHERE id_notification = ${notification.id_notification}`)
    let from = notification.sender_name ? `"${notification.sender_name}" <${notification.sender}%>` : notification.sender

    // send mail with defined transport object
    const info = await mailer.sendMail({
      from,
      to: notification.recipient,
      subject: notification.subject,
      text: notification.notification
      //html: "<h1>Hello world</h1>"
    });

    const response = JSON.stringify({
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      id: info.messageId
    })

    db.query(sql`UPDATE notifications SET sent = ${(new Date()).toISOString()}, response = ${response} WHERE id_notification = ${notification.id_notification}`)
  }
}
