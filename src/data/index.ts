import { FirestoreDocumentReference, FirestoreFieldValue } from '../adaptor'
import { pathToRef, Ref, refToFirebaseDocument } from '../ref'
import { Value } from '../value'

export function unwrapData(value: any) {
  if (value && typeof value === 'object') {
    if (value.__type__ === 'ref') {
      return refToFirebaseDocument(value as Ref<any>)
    } else if (value.__type__ === 'value') {
      const fieldValue = value as Value<any>
      switch (fieldValue.operation) {
        case 'clear':
          return FirestoreFieldValue.delete()
        case 'increment':
          return FirestoreFieldValue.increment(fieldValue.number)
      }
    }

    const unwrappedObject: { [key: string]: any } = Object.assign(
      Array.isArray(value) ? [] : {},
      value
    )
    Object.keys(unwrappedObject).forEach(key => {
      unwrappedObject[key] = unwrapData(unwrappedObject[key])
    })
    return unwrappedObject
  } else if (value === undefined) {
    return null
  } else {
    return value
  }
}

export function wrapData(data: unknown) {
  if (data instanceof FirestoreDocumentReference) {
    return pathToRef(data.path)
  } else if (data && typeof data === 'object') {
    const wrappedData: { [key: string]: any } = Object.assign(
      Array.isArray(data) ? [] : {},
      data
    )
    Object.keys(wrappedData).forEach(key => {
      wrappedData[key] = wrapData(wrappedData[key])
    })
    return wrappedData
  } else {
    return data
  }
}
