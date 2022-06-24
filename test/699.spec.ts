import * as path from 'path';
import { expect } from 'chai';
import * as request from 'supertest';
import { createApp } from './common/app';

import { date, dateTime } from '../src/framework/base.serdes';

const apiSpecPath = path.join('test', 'resources', '699.yaml');
const apiSpecPath2 = path.join('test', 'resources', '699-2.json');

class ObjectID {
  id: string;

  constructor(id: string = '5fdefd13a6640bb5fb5fa925') {
    this.id = id;
  }

  toString() {
    return this.id;
  }
}

class BadDate extends Date {
  public toISOString(): string {
    return 'oh no a bad iso date';
  }
}

describe('699', () => {
  let app = null;

  before(async () => {
    // set up express app
    app = await createApp(
      {
        apiSpec: apiSpecPath,
        validateRequests: {
          coerceTypes: true,
        },
        validateResponses: {
          coerceTypes: true,
        },
        serDes: [
          date,
          dateTime,
          {
            format: 'mongo-objectid',
            deserialize: (s) => new ObjectID(s),
            serialize: (o) => o.toString(),
          },
        ],
        unknownFormats: ['string-list'],
      },
      3005,
      (app) => {
        app.get([`${app.basePath}/users/:id?`], (req, res) => {
          if (typeof req.params.id !== 'object') {
            throw new Error('Should be deserialized to ObjectId object');
          }
          let date = new Date('2020-12-20T07:28:19.213Z');

          const response = {
            id: req.params.id,
            // creationDateTime: date,
            // creationDate: date,
            shortOrLong: 'a',
            history: [
              {
                modificationDate: date,
              },
              {
                modificationDate: date,
              },
              {
                modificationDate: date,
              },
              {
                modificationDate: date,
              },
            ],
          };
          console.log(response);
          res.json(response);
        });
        app.post([`${app.basePath}/users`], (req, res) => {
          if (typeof req.body.id !== 'object') {
            throw new Error('Should be deserialized to ObjectId object');
          }
          if (
            typeof req.body.creationDate !== 'object' ||
            !(req.body.creationDate instanceof Date)
          ) {
            throw new Error('Should be deserialized to Date object');
          }
          if (
            typeof req.body.creationDateTime !== 'object' ||
            !(req.body.creationDateTime instanceof Date)
          ) {
            throw new Error('Should be deserialized to Date object');
          }
          res.json(req.body);
        });
        app.use((err, req, res, next) => {
          res.status(err.status ?? 500).json({
            message: err.message,
            code: err.status ?? 500,
          });
        });
      },
      false,
    );
    return app;
  });

  after(() => {
    app.server.close();
  });

  it('should control BAD id format and throw an error', async () =>
    request(app)
      .get(`${app.basePath}/users/1234`)
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          'request/params/id must match pattern "^[0-9a-fA-F]{24}$"',
        );
      }));

  it('should control GOOD id format and get a response in expected format', async () =>
    request(app)
      .get(`${app.basePath}/users/5fdefd13a6640bb5fb5fa925`)
      .expect(200)
      .then((r) => {
        expect(r.body.id).to.equal('5fdefd13a6640bb5fb5fa925');
        // expect(r.body.creationDate).to.equal('2020-12-20');
        // expect(r.body.creationDateTime).to.equal('2020-12-20T07:28:19.213Z');
        expect(r.body.history[0].modificationDate).to.equal('2020-12-20');
      }));

  it('should POST also works with deserialize on request then serialize en response', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
        shortOrLong: 'ab',
      })
      .set('Content-Type', 'application/json')
      .expect(200)
      .then((r) => {
        expect(r.body.id).to.equal('5fdefd13a6640bb5fb5fa925');
        expect(r.body.creationDate).to.equal('2020-12-20');
        expect(r.body.creationDateTime).to.equal('2020-12-20T07:28:19.213Z');
      }));

  it('should POST throw error on invalid schema ObjectId', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
        shortOrLong: 'abcd',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          'request/body/id must match pattern "^[0-9a-fA-F]{24}$"',
        );
      }));

  it('should POST throw error on invalid schema Date', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-1f-20',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          'request/body/creationDate must match format "date"',
        );
      }));

  it('should enforce anyOf validations', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
        shortOrLong: 'abc',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          [
            'request/body/shortOrLong must NOT have more than 2 characters',
            'request/body/shortOrLong must NOT have fewer than 4 characters',
            'request/body/shortOrLong must match a schema in anyOf',
          ].join(', '),
        );
      }));
});

/**
 * Should pass if schema.preprocessor.ts l202-204 is active
 * Should fail if not, with message:
 *  /response/data/0/job/timeStarted must be string
 *  /response/data/0/job/timeFinished must be string
 *  /response/data/0/job/jobSteps/0/startedAt must be string
 *  /response/data/0/job/jobSteps/0/finishedAt must be string
 *  /response/data/0/job/jobSteps/1/startedAt must be string
 *  /response/data/0/job/jobSteps/1/finishedAt must be string
 *  /response/data/0/createdAt must be string
 *
 * rootTestDate pass
 *
 */
describe('699 serdes array date test', () => {
  const responseData = {
    total: 8,
    rootTestDate: new Date('2022-06-16T08:00:00.051Z'),
    data: [
      {
        id: 8,
        createdAt: new Date('2022-06-16T08:00:00.051Z'),
        job: {
          id: 8,
          timeStarted: new Date('2022-06-16T08:00:01.000Z'),
          timeFinished: new Date('2022-06-16T08:00:27.000Z'),
          jobSteps: [
            {
              index: 0,
              startedAt: new Date('2022-06-16T08:00:00.071Z'),
              finishedAt: new Date('2022-06-16T08:00:00.071Z'),
            },
            {
              index: 1,
              startedAt: new Date('2022-06-16T08:00:00.071Z'),
              finishedAt: new Date('2022-06-16T08:00:01.148Z'),
            },
          ],
        },
      },
    ],
  };

  let app = null;

  before(async () => {
    // set up express app
    app = await createApp(
      {
        ignorePaths: /.*\/api\/v.\/doc.*/,
        apiSpec: apiSpecPath2,
        validateRequests: true,
        validateResponses: true,
        // Fix a bug when using multiple method (get/post) for a same path
        // see https://github.com/cdimascio/express-openapi-validator/issues/527
        $refParser: {
          mode: 'dereference',
        },
      },
      3005,
      (app) => {
        console.log(app.basePath);
        app.get([`${app.basePath}/export`], (req, res) => {
          console.log('WILL RES', responseData.data[0].job);
          res.json(responseData);
        });
        app.use((err, req, res, next) => {
          res.status(err.status ?? 500).json({
            message: err.message,
            code: err.status ?? 500,
          });
        });
      },
      false,
    );
    return app;
  });

  after(() => {
    app.server.close();
  });

  it('should validate complex object', (done) => {
    request(app)
      .get(`${app.basePath}/export`)
      // .expect(400)
      .end((err, { body }) => {
        if (err) {
          console.log(err);
          return done();
        }
        console.log(body);
        expect(typeof body.data[0].job.timeFinished).to.equal('string');
        done();
      });
  });
});

describe('699 serialize response components only', () => {
  let app = null;

  before(async () => {
    // set up express app
    app = await createApp(
      {
        apiSpec: apiSpecPath,
        validateRequests: {
          coerceTypes: true,
        },
        validateResponses: {
          coerceTypes: true,
        },
        serDes: [
          date.serializer,
          dateTime.serializer,
          {
            format: 'mongo-objectid',
            serialize: (o) => o.toString(),
          },
        ],
        unknownFormats: ['mongo-objectid', 'string-list'],
      },
      3005,
      (app) => {
        app.get([`${app.basePath}/users/:id?`], (req, res) => {
          if (typeof req.params.id !== 'string') {
            throw new Error('Should be not be deserialized to ObjectId object');
          }
          let date = new Date('2020-12-20T07:28:19.213Z');
          let result = {
            id: new ObjectID(req.params.id),
            creationDateTime: date,
            creationDate: undefined,
            shortOrLong: 'a',
            history: [
              {
                modificationDate: date,
              },
            ],
          };
          if (req.query.baddateresponse === 'functionNotExists') {
            result.creationDate = new ObjectID();
          } else if (req.query.baddateresponse === 'functionBadFormat') {
            result.creationDate = new BadDate();
          } else {
            result.creationDate = date;
          }
          console.log(result);
          res.json(result);
        });
        app.post([`${app.basePath}/users`], (req, res) => {
          if (typeof req.body.id !== 'string') {
            throw new Error('Should NOT be deserialized to ObjectId object');
          }
          if (typeof req.body.creationDate !== 'string') {
            throw new Error('Should NTO be deserialized to Date object');
          }
          if (typeof req.body.creationDateTime !== 'string') {
            throw new Error('Should NOT be deserialized to Date object');
          }
          req.body.id = new ObjectID(req.body.id);
          req.body.creationDateTime = new Date(req.body.creationDateTime);
          // We let creationDate as String and it should also work (either in Date Object ou String 'date' format)
          res.json(req.body);
        });
        app.use((err, req, res, next) => {
          res.status(err.status ?? 500).json({
            message: err.message,
            code: err.status ?? 500,
          });
        });
      },
      false,
    );
    return app;
  });

  after(() => {
    app.server.close();
  });

  it('should control BAD id format and throw an error', async () =>
    request(app)
      .get(`${app.basePath}/users/1234`)
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          'request/params/id must match pattern "^[0-9a-fA-F]{24}$"',
        );
      }));

  it('should control GOOD id format and get a response in expected format', async () =>
    request(app)
      .get(`${app.basePath}/users/5fdefd13a6640bb5fb5fa925`)
      .expect(200)
      .then((r) => {
        expect(r.body.id).to.equal('5fdefd13a6640bb5fb5fa925');
        expect(r.body.creationDate).to.equal('2020-12-20');
        expect(r.body.creationDateTime).to.equal('2020-12-20T07:28:19.213Z');
        expect(r.body.history[0].modificationDate).to.equal('2020-12-20');
      }));

  it('should POST also works with deserialize on request then serialize en response', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
      })
      .set('Content-Type', 'application/json')
      .expect(200)
      .then((r) => {
        expect(r.body.id).to.equal('5fdefd13a6640bb5fb5fa925');
        expect(r.body.creationDate).to.equal('2020-12-20');
        expect(r.body.creationDateTime).to.equal('2020-12-20T07:28:19.213Z');
      }));

  it('should POST throw error on invalid schema ObjectId', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          'request/body/id must match pattern "^[0-9a-fA-F]{24}$"',
        );
      }));

  it('should POST throw error on invalid schema Date', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-1f-20',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          'request/body/creationDate must match format "date"',
        );
      }));

  it('should throw error 500 on invalid object type instead of Date expected', async () =>
    request(app)
      .get(`${app.basePath}/users/5fdefd13a6640bb5fb5fa925`)
      .query({ baddateresponse: 'functionNotExists' })
      .expect(500)
      .then((r) => {
        expect(r.body.message).to.equal(
          '/response/creationDate format is invalid',
        );
      }));

  it('should enforce anyOf validations', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
        shortOrLong: 'abc',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          [
            'request/body/shortOrLong must NOT have more than 2 characters',
            'request/body/shortOrLong must NOT have fewer than 4 characters',
            'request/body/shortOrLong must match a schema in anyOf',
          ].join(', '),
        );
      }));

  /*
  FIXME Manage format validation after serialize ? I can serialize using a working serialize method but that respond a bad format
  it('should throw error 500 on an object that serialize to a bad string format', async () =>

    request(app)
      .get(`${app.basePath}/users/5fdefd13a6640bb5fb5fa925`)
      .query({baddateresponse : 'functionBadFormat'})
      .expect(200)
      .then((r) => {
        expect(r.body.message).to.equal('Something saying that date is not date-time format');
      }));

   */

});

describe('699 with array type string-list', () => {
  let app = null;

  before(async () => {
    // set up express app
    app = await createApp(
      {
        apiSpec: apiSpecPath,
        validateRequests: {
          coerceTypes: true,
        },
        validateResponses: {
          coerceTypes: true,
        },
        serDes: [
          date,
          dateTime,
          {
            format: 'mongo-objectid',
            deserialize: (s) => new ObjectID(s),
            serialize: (o) => o.toString(),
          },
          {
            format: 'string-list',
            deserialize: (s): string[] => s.split(',').map((s) => s.trim()),
            serialize: (o): string => (o as string[]).join(','),
          },
        ],
      },
      3005,
      (app) => {
        app.get([`${app.basePath}/users/:id?`], (req, res) => {
          if (typeof req.params.id !== 'object') {
            throw new Error('Should be deserialized to ObjectId object');
          }
          let date = new Date('2020-12-20T07:28:19.213Z');
          res.json({
            id: req.params.id,
            tags: ['aa', 'bb', 'cc'],
            creationDateTime: date,
            creationDate: date,
            history: [
              {
                modificationDate: date,
              },
            ],
          });
        });
        app.post([`${app.basePath}/users`], (req, res) => {
          if (typeof req.body.id !== 'object') {
            throw new Error('Should be deserialized to ObjectId object');
          }
          if (!Array.isArray(req.body.tags)) {
            throw new Error('Should be deserialized to an Array object');
          }
          if (
            typeof req.body.creationDate !== 'object' ||
            !(req.body.creationDate instanceof Date)
          ) {
            throw new Error('Should be deserialized to Date object');
          }
          if (
            typeof req.body.creationDateTime !== 'object' ||
            !(req.body.creationDateTime instanceof Date)
          ) {
            throw new Error('Should be deserialized to Date object');
          }
          res.json(req.body);
        });
        app.use((err, req, res, next) => {
          res.status(err.status ?? 500).json({
            message: err.message,
            code: err.status ?? 500,
          });
        });
      },
      false,
    );
    return app;
  });

  after(() => {
    app.server.close();
  });

  it('should control BAD id format and throw an error', async () =>
    request(app)
      .get(`${app.basePath}/users/1234`)
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          'request/params/id must match pattern "^[0-9a-fA-F]{24}$"',
        );
      }));

  it('should control GOOD id format and get a response in expected format', async () => {
    request(app)
      .get(`${app.basePath}/users/5fdefd13a6640bb5fb5fa925`)
      .expect(200)
      .then((r) => {
        expect(r.body.id).to.equal('5fdefd13a6640bb5fb5fa925');
        expect(r.body.creationDate).to.equal('2020-12-20');
        expect(r.body.creationDateTime).to.equal('2020-12-20T07:28:19.213Z');
        expect(r.body.tags).to.equal('aa,bb,cc');
        expect(r.body.history[0].modificationDate).to.equal('2020-12-20');
      });
  });

  it('should POST also works with deserialize on request then serialize en response', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        tags: 'aa,bb,cc',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
        shortOrLong: 'abcdef',
      })
      .set('Content-Type', 'application/json')
      .expect(200)
      .then((r) => {
        expect(r.body.id).to.equal('5fdefd13a6640bb5fb5fa925');
        expect(r.body.creationDate).to.equal('2020-12-20');
        expect(r.body.creationDateTime).to.equal('2020-12-20T07:28:19.213Z');
        expect(r.body.tags).to.equal('aa,bb,cc');
      }));

  it('should POST throw error on invalid schema ObjectId', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa',
        tags: 'aa,bb,cc',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          'request/body/id must match pattern "^[0-9a-fA-F]{24}$"',
        );
      }));

  it('should POST throw error on invalid schema Date', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        tags: 'aa,bb,cc',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-1f-20',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          'request/body/creationDate must match format "date"',
        );
      }));

  it('should POST throw error for deserialize on request of non-string format', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        tags: ['aa', 'bb', 'cc'],
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal('request/body/tags must be string');
      }));

  it('should enforce anyOf validations', async () =>
    request(app)
      .post(`${app.basePath}/users`)
      .send({
        id: '5fdefd13a6640bb5fb5fa925',
        creationDateTime: '2020-12-20T07:28:19.213Z',
        creationDate: '2020-12-20',
        shortOrLong: 'abc',
      })
      .set('Content-Type', 'application/json')
      .expect(400)
      .then((r) => {
        expect(r.body.message).to.equal(
          [
            'request/body/shortOrLong must NOT have more than 2 characters',
            'request/body/shortOrLong must NOT have fewer than 4 characters',
            'request/body/shortOrLong must match a schema in anyOf',
          ].join(', '),
        );
      }));
});
