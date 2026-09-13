import { describe, expect, it } from 'vitest'
import { extractScheduleDetails, normalizePeerDetails, type RecognizedScheduleMeeting } from './schedule-ocr'

describe('schedule OCR detail parsing', () => {
  it('extracts same-line rooms and instructors', () => {
    expect(extractScheduleDetails('HAMP 3153, G Caviglia,\n08/24 - 12/11'))
      .toEqual({ location:'HAMP 3153', instructor:'G Caviglia' })
    expect(extractScheduleDetails('SMTH 208, A Sedunova,\n08/24 - 12/11'))
      .toEqual({ location:'SMTH 208', instructor:'A Sedunova' })
  })

  it('extracts an instructor placed below the room', () => {
    expect(extractScheduleDetails('LWSN B158\nKAmeranis\n08/27 - 12/10'))
      .toEqual({ location:'LWSN B158', instructor:'K Ameranis' })
  })

  it('uses repeated meetings to correct an isolated room or instructor OCR error', () => {
    const row = (dayOfWeek: number, location: string, instructor: string): RecognizedScheduleMeeting => ({
      courseCode:'MA 351', dayOfWeek, startTime:'13:30', endTime:'14:20', location, instructor,
      label:'Lecture', sourceImageName:'schedule.jpg', confidence:.7
    })
    const meetings = [
      row(1, 'SMTH 208', 'A Sedunova'),
      row(3, 'SMTH 208', 'A Sedunova'),
      row(5, 'ISMTH 208', 'ASedunova')
    ]

    expect(normalizePeerDetails(meetings).map((item) => [item.location, item.instructor])).toEqual([
      ['SMTH 208', 'A Sedunova'], ['SMTH 208', 'A Sedunova'], ['SMTH 208', 'A Sedunova']
    ])
  })
})
