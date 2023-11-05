
import {EventEmitter} from 'node:events'

// https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream

export class EventStreamParser extends EventEmitter {
  #leftover; #event = {data: ''}; #lastEventId = ''

  chunk(chunk) {
    let offset = 0
    if (this.#leftover) {
      chunk = this.#leftover + chunk
      this.#leftover = null
    }
    while (true) {
      const {endOffset, endlWidth} = findOfEndline(chunk, offset)
      if (endOffset == -1) {
        if (offset < chunk.length) {
          this.#leftover = chunk.slice(offset)
        }
        break // end of line NOT reached
      }
      const line = chunk.slice(offset, endOffset)
      if (!line) { // empty lines separate events
        if (this.#event.data) {
          let data = this.#event.data
          if (data.endsWith('\n')) {
            data = data.slice(0, -1)
          }
          const eventData = {
            type: this.#event.name || 'message',
            data: data || '',
            lastEventId: this.#lastEventId || '',
          }
          this.emit('event', eventData)
        }
        this.#event = {data: ''}
      } else { // a non-empty line
        const colPos = line.indexOf(':')
        let fieldName, fieldValue
        if (colPos == -1) { // if no colon then the entire line is a field name
          fieldName = line
          fieldValue = ''
        } else  {
          fieldName = line.slice(0, colPos)
          if (fieldName) {
            fieldValue = line.slice(colPos + (line[colPos+1] == ' ' ? 2 : 1))
          }
        }
        switch (fieldName) {
          case 'id': this.#lastEventId = fieldValue; break
          case 'event': this.#event.name = fieldValue; break
          case 'data': this.#event.data += fieldValue+'\n'; break
          case 'retry': this.emit('retry', fieldValue); break
        }
      }
      offset = endOffset + endlWidth
      if (offset == chunk.length) break
    }
  }
}

/** It's a totally ridiculous protocol which allows for 3 different field endings... It's beyond stupid! */
function findOfEndline(string, offset) {
  let endOffset, endlWidth = 1
  endOffset = string.indexOf('\n', offset)
  if (endOffset == -1) { // LF not found
    endOffset = string.indexOf('\r', offset) // using CR?
  } else { // check if LF is preceded by CR
    if (string[endOffset-1] == '\r') {
      endOffset --
      endlWidth ++
    }
  }
  return {endOffset, endlWidth}
}
