import assert from 'assert'
import nanoid from 'nanoid'
import add from '../add'
import { where } from '../where'
import { limit } from '../limit'
import onQuery from '.'
import { collection } from '../collection'
import { order } from '../order'
import { startAfter, startAt, endBefore, endAt } from '../cursor'
import { Ref, ref } from '../ref'
import { Doc } from '../doc'
import get from '../get'
import set from '../set'
import sinon from 'sinon'
import { subcollection } from '../subcollection'
import { group } from '../group'
import remove from '../remove'

describe('onQuery', () => {
  type Contact = { ownerId: string; name: string; year: number; birthday: Date }
  type Message = { ownerId: string; author: Ref<Contact>; text: string }

  const contacts = collection<Contact>('contacts')
  const messages = collection<Message>('messages')

  let off: () => void | undefined

  let lesha: Doc<Contact>
  let sasha: Doc<Contact>
  let tati: Doc<Contact>
  let ownerId: string

  function setLesha() {
    return set(contacts, `lesha-${ownerId}`, {
      ownerId,
      name: 'Lesha',
      year: 1995,
      birthday: new Date(1995, 6, 2)
    })
  }

  beforeEach(async () => {
    ownerId = nanoid()
    lesha = await setLesha()
    sasha = await set(contacts, `sasha-${ownerId}`, {
      ownerId,
      name: 'Sasha',
      year: 1987,
      birthday: new Date(1987, 1, 11)
    })
    tati = await set(contacts, `tati-${ownerId}`, {
      ownerId,
      name: 'Tati',
      year: 1989,
      birthday: new Date(1989, 6, 10)
    })
  })

  afterEach(() => {
    off && off()
    off = undefined
  })

  it('queries documents', done => {
    const spy = sinon.spy()
    off = onQuery(contacts, [where('ownerId', '==', ownerId)], docs => {
      spy(docs.map(({ data: { name } }) => name).sort())
      if (spy.calledWithMatch(['Lesha', 'Sasha', 'Tati'])) done()
    })
  })

  it('allows to query by value in maps', async () => {
    const spy = sinon.spy()
    type Location = { mapId: string; name: string; address: { city: string } }
    const locations = collection<Location>('locations')
    const mapId = nanoid()
    await Promise.all([
      add(locations, {
        mapId,
        name: 'Pizza City',
        address: { city: 'New York' }
      }),
      add(locations, {
        mapId,
        name: 'Bagels Tower',
        address: { city: 'New York' }
      }),
      add(locations, {
        mapId,
        name: 'Tacos Cave',
        address: { city: 'Houston' }
      })
    ])
    return new Promise(resolve => {
      off = onQuery(
        locations,
        [
          where('mapId', '==', mapId),
          where(['address', 'city'], '==', 'New York')
        ],
        docs => {
          spy(docs.map(({ data: { name } }) => name).sort())
          if (spy.calledWithMatch(['Bagels Tower', 'Pizza City'])) resolve()
        }
      )
    })
  })

  describe('with messages', () => {
    beforeEach(async () => {
      await Promise.all([
        add(messages, { ownerId, author: sasha.ref, text: '+1' }),
        add(messages, { ownerId, author: lesha.ref, text: '+1' }),
        add(messages, { ownerId, author: tati.ref, text: 'wut' }),
        add(messages, { ownerId, author: sasha.ref, text: 'lul' })
      ])
    })

    it('expands references', done => {
      const spy = sinon.spy()
      off = onQuery(
        messages,
        [where('ownerId', '==', ownerId), where('text', '==', '+1')],
        async docs => {
          const authors = await Promise.all(
            docs.map(doc => get(contacts, doc.data.author.id))
          )
          spy(authors.map(({ data: { name } }) => name).sort())
          if (spy.calledWithMatch(['Lesha', 'Sasha'])) done()
        }
      )
    })

    it('allows to query by reference', done => {
      const spy = sinon.spy()
      off = onQuery(
        messages,
        [where('ownerId', '==', ownerId), where('author', '==', sasha.ref)],
        docs => {
          spy(docs.map(doc => doc.data.text).sort())
          if (spy.calledWithMatch(['+1', 'lul'])) done()
        }
      )
    })

    it('allows querying collection groups', async () => {
      const ownerId = nanoid()
      const contactMessages = subcollection<Message, Contact>(
        'contactMessages',
        contacts
      )
      const sashaRef = ref(contacts, `${ownerId}-sasha`)
      const sashasContactMessages = contactMessages(sashaRef)
      add(sashasContactMessages, {
        ownerId,
        author: sashaRef,
        text: 'Hello from Sasha!'
      })
      const tatiRef = ref(contacts, `${ownerId}-tati`)
      const tatisContactMessages = contactMessages(tatiRef)
      await Promise.all([
        add(tatisContactMessages, {
          ownerId,
          author: tatiRef,
          text: 'Hello from Tati!'
        }),
        add(tatisContactMessages, {
          ownerId,
          author: tatiRef,
          text: 'Hello, again!'
        })
      ])
      const allContactMessages = group('contactMessages', [contactMessages])
      const spy = sinon.spy()
      return new Promise(resolve => {
        off = onQuery(
          allContactMessages,
          [where('ownerId', '==', ownerId)],
          async messages => {
            spy(messages.map(m => m.data.text).sort())
            if (messages.length === 3) {
              await Promise.all([
                add(sashasContactMessages, {
                  ownerId,
                  author: sashaRef,
                  text: '1'
                }),
                add(tatisContactMessages, {
                  ownerId,
                  author: tatiRef,
                  text: '2'
                })
              ])
            } else if (messages.length === 5) {
              assert(
                spy.calledWithMatch([
                  'Hello from Sasha!',
                  'Hello from Tati!',
                  'Hello, again!'
                ])
              )
              assert(
                spy.calledWithMatch([
                  '1',
                  '2',
                  'Hello from Sasha!',
                  'Hello from Tati!',
                  'Hello, again!'
                ])
              )
              resolve()
            }
          }
        )
      })
    })
  })

  it('allows to query by date', done => {
    off = onQuery(
      contacts,
      [
        where('ownerId', '==', ownerId),
        where('birthday', '==', new Date(1987, 1, 11))
      ],
      docs => {
        if (docs.length === 1 && docs[0].data.name === 'Sasha') done()
      }
    )
  })

  describe('ordering', () => {
    it('allows ordering', done => {
      const spy = sinon.spy()
      off = onQuery(
        contacts,
        [where('ownerId', '==', ownerId), order('year', 'asc')],
        docs => {
          spy(docs.map(({ data: { name } }) => name))
          if (spy.calledWithMatch(['Sasha', 'Tati', 'Lesha'])) done()
        }
      )
    })

    it('allows ordering by desc', done => {
      const spy = sinon.spy()
      off = onQuery(
        contacts,
        [where('ownerId', '==', ownerId), order('year', 'desc')],
        docs => {
          spy(docs.map(({ data: { name } }) => name))
          if (spy.calledWithMatch(['Lesha', 'Tati', 'Sasha'])) done()
        }
      )
    })

    describe('with messages', () => {
      beforeEach(async () => {
        await Promise.all([
          add(messages, { ownerId, author: sasha.ref, text: '+1' }),
          add(messages, { ownerId, author: lesha.ref, text: '+1' }),
          add(messages, { ownerId, author: tati.ref, text: 'wut' }),
          add(messages, { ownerId, author: sasha.ref, text: 'lul' })
        ])
      })

      it('allows ordering by references', done => {
        const spy = sinon.spy()
        off = onQuery(
          messages,
          [
            where('ownerId', '==', ownerId),
            order('author', 'desc'),
            order('text')
          ],
          async docs => {
            const messagesLog = await Promise.all(
              docs.map(doc =>
                get(contacts, doc.data.author.id).then(
                  contact => `${contact.data.name}: ${doc.data.text}`
                )
              )
            )
            spy(messagesLog)
            if (
              spy.calledWithMatch([
                'Tati: wut',
                'Sasha: +1',
                'Sasha: lul',
                'Lesha: +1'
              ])
            )
              done()
          }
        )
      })
    })

    it('allows ordering by date', done => {
      const spy = sinon.spy()
      off = onQuery(
        contacts,
        [where('ownerId', '==', ownerId), order('birthday', 'asc')],
        docs => {
          spy(docs.map(({ data: { name } }) => name))
          if (spy.calledWithMatch(['Sasha', 'Tati', 'Lesha'])) done()
        }
      )
    })
  })

  describe('limiting', () => {
    it('allows to limit response length', done => {
      const spy = sinon.spy()
      off = onQuery(
        contacts,
        [where('ownerId', '==', ownerId), order('year', 'asc'), limit(2)],
        docs => {
          spy(docs.map(({ data: { name } }) => name))
          if (spy.calledWithMatch(['Sasha', 'Tati'])) done()
        }
      )
    })
  })

  describe('paginating', () => {
    describe('startAfter', () => {
      let page1Off: () => void
      let page2Off: () => void

      afterEach(() => {
        page1Off && page1Off()
        page2Off && page2Off()
      })

      it('allows to paginate', done => {
        const spyPage1 = sinon.spy()
        const spyPage2 = sinon.spy()
        page1Off = onQuery(
          contacts,
          [
            where('ownerId', '==', ownerId),
            order('year', 'asc', [startAfter(undefined)]),
            limit(2)
          ],
          page1Docs => {
            spyPage1(page1Docs.map(({ data: { name } }) => name))
            if (spyPage1.calledWithMatch(['Sasha', 'Tati'])) {
              page1Off()

              page2Off = onQuery(
                contacts,
                [
                  where('ownerId', '==', ownerId),
                  order('year', 'asc', [startAfter(page1Docs[1].data.year)]),
                  limit(2)
                ],
                page2Docs => {
                  spyPage2(page2Docs.map(({ data: { name } }) => name))
                  if (spyPage2.calledWithMatch(['Lesha'])) done()
                }
              )
            }
          }
        )
      })
    })

    describe('startAt', () => {
      it('allows to paginate', done => {
        const spy = sinon.spy()
        off = onQuery(
          contacts,
          [
            where('ownerId', '==', ownerId),
            order('year', 'asc', [startAt(1989)]),
            limit(2)
          ],
          docs => {
            spy(docs.map(({ data: { name } }) => name))
            if (spy.calledWithMatch(['Tati', 'Lesha'])) done()
          }
        )
      })
    })

    describe('endBefore', () => {
      it('allows to paginate', done => {
        const spy = sinon.spy()
        off = onQuery(
          contacts,
          [
            where('ownerId', '==', ownerId),
            order('year', 'asc', [endBefore(1989)]),
            limit(2)
          ],
          docs => {
            spy(docs.map(({ data: { name } }) => name))
            if (spy.calledWithMatch(['Sasha'])) done()
          }
        )
      })
    })

    describe('endAt', () => {
      it('allows to paginate', done => {
        const spy = sinon.spy()
        off = onQuery(
          contacts,
          [
            where('ownerId', '==', ownerId),
            order('year', 'asc', [endAt(1989)]),
            limit(2)
          ],
          docs => {
            spy(docs.map(({ data: { name } }) => name))
            if (spy.calledWithMatch(['Sasha', 'Tati'])) done()
          }
        )
      })
    })

    it('uses asc ordering method by default', done => {
      const spy = sinon.spy()
      off = onQuery(
        contacts,
        [
          where('ownerId', '==', ownerId),
          order('year', [startAt(1989)]),
          limit(2)
        ],
        docs => {
          spy(docs.map(({ data: { name } }) => name))
          if (spy.calledWithMatch(['Tati', 'Lesha'])) done()
        }
      )
    })

    it('allows specify multiple cursor conditions', async () => {
      const spy = sinon.spy()
      type City = { mapId: string; name: string; state: string }
      const cities = collection<City>('cities')
      const mapId = nanoid()
      await Promise.all([
        add(cities, {
          mapId,
          name: 'Springfield',
          state: 'Massachusetts'
        }),
        add(cities, {
          mapId,
          name: 'Springfield',
          state: 'Missouri'
        }),
        add(cities, {
          mapId,
          name: 'Springfield',
          state: 'Wisconsin'
        })
      ])
      return new Promise(async resolve => {
        off = await onQuery(
          cities,
          [
            where('mapId', '==', mapId),
            order('name', 'asc', [startAt('Springfield')]),
            order('state', 'asc', [startAt('Missouri')]),
            limit(2)
          ],
          docs => {
            spy(docs.map(({ data: { name, state } }) => `${name}, ${state}`))
            if (
              spy.calledWithMatch([
                'Springfield, Missouri',
                'Springfield, Wisconsin'
              ])
            )
              resolve()
          }
        )
      })
    }, 10000)

    it('allows to combine cursors', done => {
      const spy = sinon.spy()
      off = onQuery(
        contacts,
        [
          where('ownerId', '==', ownerId),
          order('year', 'asc', [startAt(1989), endAt(1989)]),
          limit(2)
        ],
        docs => {
          spy(docs.map(({ data: { name } }) => name))
          if (spy.calledWithMatch(['Tati'])) done()
        }
      )
    })

    // TODO: Figure out how to use references as cursors
    // it.skip('allows to pass refs as cursors', done => {
    //   off = onQuery(
    //     contacts,
    //     [
    //       where('ownerId', '==', ownerId),
    //       order('year', 'asc', [startAt(tati.ref)]),
    //       limit(2)
    //     ],
    //     docs => {
    //       off()
    //       assert.deepEqual(docs.map(({ data: { name } }) => name), [
    //         'Tati',
    //         'Lesha'
    //       ])
    //       done()
    //     }
    //   )
    // })

    it('allows using dates as cursors', done => {
      const spy = sinon.spy()
      off = onQuery(
        contacts,
        [
          where('ownerId', '==', ownerId),
          order('birthday', 'asc', [startAt(new Date(1989, 6, 10))]),
          limit(2)
        ],
        docs => {
          spy(docs.map(({ data: { name } }) => name))
          if (spy.calledWithMatch(['Tati', 'Lesha'])) done()
        }
      )
    })
  })

  describe('real-time', () => {
    const theoId = `theo-${ownerId}`

    beforeEach(async () => {
      await set(contacts, theoId, {
        ownerId,
        name: 'Theodor',
        year: 2019,
        birthday: new Date(2019, 5, 4)
      })
    })

    afterEach(async () => {
      await remove(contacts, theoId)
    })

    it('subscribes to updates', done => {
      const spy = sinon.spy()
      off = onQuery(
        contacts,
        [
          where('ownerId', '==', ownerId),
          // TODO: Figure out why when a timestamp is used, the order is incorrect
          // order('birthday', 'asc', [startAt(new Date(1989, 6, 10))]),
          order('year', 'asc', [startAt(1989)]),
          limit(3)
        ],
        async docs => {
          const names = docs.map(({ data: { name } }) => name)
          spy(names)

          if (spy.calledWithMatch(['Tati', 'Lesha', 'Theodor'])) {
            await remove(lesha.ref)
          }

          if (spy.calledWithMatch(['Tati', 'Theodor'])) {
            done()
          }
        }
      )
    })

    // TODO: WTF browser Firebase returns elements gradually unlike Node.js version.
    if (typeof window === 'undefined') {
      it('returns function that unsubscribes from the updates', () => {
        return new Promise(async resolve => {
          const spy = sinon.spy()
          const on = () => {
            off = onQuery(
              contacts,
              [
                where('ownerId', '==', ownerId),
                // TODO: Figure out why when a timestamp is used, the order is incorrect
                // order('birthday', 'asc', [startAt(new Date(1989, 6, 10))]),
                order('year', 'asc', [startAt(1989)]),
                limit(3)
              ],
              async docs => {
                const names = docs.map(({ data: { name } }) => name)
                spy(names)

                if (
                  spy.calledWithMatch(['Tati', 'Theodor']) &&
                  spy.neverCalledWithMatch(['Tati', 'Lesha', 'Theodor'])
                )
                  resolve()
              }
            )
          }
          on()
          off()
          await remove(lesha.ref)
          on()
        })
      })
    }

    it('calls onError when query is invalid', done => {
      const onResult = sinon.spy()
      off = onQuery(
        contacts,
        [
          where('ownerId', '==', ownerId),
          where('year', '>', 1989),
          where('birthday', '>', new Date(1989, 6, 10))
        ],
        onResult,
        err => {
          assert(!onResult.called)
          assert(
            // Node.js:
            err.message.match(
              /Cannot have inequality filters on multiple properties: birthday/
            ) ||
              // Browser:
              err.message.match(/Invalid query/)
          )
          done()
        }
      )
    })
  })
})
