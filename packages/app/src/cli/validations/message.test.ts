import {validateMessage} from './message.js'
import {describe, expect, test} from 'vitest'

describe('validateMessage', () => {
  test('when message value meets all requirements should not throw any error', async () => {
    // Given
    const version = 'less than 200 chars'

    // When
    expect(() => validateMessage(version)).not.toThrow()
  })

  test('when version value violates max length requirement', async () => {
    // Given
    const longMessage = 'A'.repeat(201)

    // When
    expect(() => validateMessage(longMessage)).toThrowError(`Invalid message: ${longMessage}`)
  })
})
