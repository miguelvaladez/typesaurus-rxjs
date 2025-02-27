import firestore from '../adaptor'
import { Collection } from '../collection'
import { doc, Doc } from '../doc'
import { ref, Ref } from '../ref'
import { wrapData } from '../data'

/**
 * @param ref - The reference to the document
 */
async function get<Model>(ref: Ref<Model>): Promise<Doc<Model> | undefined>

/**
 * @param collection - The collection to get document from
 * @param id - The document id
 */
async function get<Model>(
  collection: Collection<Model>,
  id: string
): Promise<Doc<Model> | undefined>

/**
 * Retrieves a document from a collection.
 *
 * ```ts
 * import { get, collection } from 'typesaurus'
 *
 * type User = { name: string }
 * const users = collection<User>('users')
 *
 * get(users, '00sHm46UWKObv2W7XK9e').then(user => {
 *   console.log(user)
 *   //=> { __type__: 'doc', data: { name: 'Sasha' }, ... }
 * })
 * // Or using ref:
 * get(currentUser.ref)
 * ```
 *
 * @returns Promise to the document or undefined if not found
 */
async function get<Model>(
  collectionOrRef: Collection<Model> | Ref<Model>,
  maybeId?: string
): Promise<Doc<Model> | undefined> {
  let collection: Collection<Model>
  let id: string

  if (collectionOrRef.__type__ === 'collection') {
    collection = collectionOrRef as Collection<Model>
    id = maybeId as string
  } else {
    const ref = collectionOrRef as Ref<Model>
    collection = ref.collection
    id = ref.id
  }

  const firestoreDoc = firestore()
    .collection(collection.path)
    .doc(id)
  const firestoreSnap = await firestoreDoc.get()
  const firestoreData = firestoreSnap.data()
  const data = firestoreData && (wrapData(firestoreData) as Model)
  return data ? doc(ref(collection, id), data) : undefined
}

export default get
