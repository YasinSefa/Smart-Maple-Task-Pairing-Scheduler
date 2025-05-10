/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";

import type { ScheduleInstance } from "../../models/schedule";
import type { UserInstance } from "../../models/user";

import FullCalendar from "@fullcalendar/react";

import interactionPlugin from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";

import type { EventInput } from "@fullcalendar/core/index.js";

import "../profileCalendar.scss";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import timezone from "dayjs/plugin/timezone";
import { updateEventDate } from "../../store/schedule/actions";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

declare global {
  interface Window {
    pairLogged?: boolean;
  }
}

type CalendarContainerProps = {
  schedule: ScheduleInstance;
  auth: UserInstance;
};

const classes = [
  "bg-one",
];

const CalendarContainer = ({ schedule, auth }: CalendarContainerProps) => {
  const dispatch = useDispatch();
  const calendarRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [highlightedDates, setHighlightedDates] = useState<string[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [initialDate, setInitialDate] = useState<Date>(new Date());

  const getPlugins = () => {
    const plugins = [dayGridPlugin];
    plugins.push(interactionPlugin);
    return plugins;
  };

  const getShiftById = (id: string) => {
    return schedule?.shifts?.find((shift: { id: string }) => id === shift.id);
  };

  const getAssigmentById = (id: string) => {
    return schedule?.assignments?.find((assign) => id === assign.id);
  };

  const getStaffById = (id: string) => {
    return schedule?.staffs?.find((staff) => id === staff.id);
  };

  const isPairConstraintViolated = (staffId: string, date: string) => {
    const staff = getStaffById(staffId);
    if (!staff?.pairList || staff.pairList.length === 0) {
        return { isPaired: false, pairIndex: -1 };
    }

    const parseDate = (dateStr: string) => {
        const [day, month, year] = dateStr.split('.');
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    };

    const formattedInputDate = dayjs(date).format("DD.MM.YYYY");
    const currentDate = parseDate(formattedInputDate);
    
    for (let i = 0; i < staff.pairList.length; i++) {
        const pair = staff.pairList[i];
        const startDate = parseDate(pair.startDate);
        const endDate = parseDate(pair.endDate);

        if (currentDate.getTime() >= startDate.getTime() && 
            currentDate.getTime() <= endDate.getTime()) {
            const pairedStaffId = pair.staffId;
            const pairedStaffIndex = schedule?.staffs?.findIndex(s => s.id === pairedStaffId) ?? -1;
            
            return { 
                isPaired: true, 
                pairIndex: pairedStaffIndex,
                pairedStaffId: pairedStaffId
            };
        }
    }
    
    return { isPaired: false, pairIndex: -1 };
};

  const validDates = () => {
    const dates = [];
    let currentDate = dayjs(schedule.scheduleStartDate);
    while (
      currentDate.isBefore(schedule.scheduleEndDate) ||
      currentDate.isSame(schedule.scheduleEndDate)
    ) {
      dates.push(currentDate.format("YYYY-MM-DD"));
      currentDate = currentDate.add(1, "day");
    }
    return dates;
  };

  const getDatesBetween = (startDate: string, endDate: string) => {
    const dates = [];
    const start = dayjs(startDate, "DD.MM.YYYY").toDate();
    const end = dayjs(endDate, "DD.MM.YYYY").toDate();
    const current = new Date(start);

    while (current <= end) {
      dates.push(dayjs(current).format("DD-MM-YYYY"));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  const generateStaffBasedCalendar = () => {
    const works: EventInput[] = [];

    for (let i = 0; i < schedule?.assignments?.length; i++) {
      const assignment = schedule?.assignments?.[i];
      if (selectedStaffId && assignment.staffId !== selectedStaffId) continue;

      const className = schedule?.shifts?.findIndex(
        (shift) => shift.id === assignment?.shiftId
      );

      const assignmentDate = dayjs(assignment?.shiftStart).format("YYYY-MM-DD");
      const isValidDate = validDates().includes(assignmentDate);
      const pairResult = isPairConstraintViolated(assignment.staffId, assignmentDate);
      const isPairViolated = pairResult.isPaired;

      const work = {
        id: assignment?.id,
        title: getShiftById(assignment?.shiftId)?.name,
        start: dayjs.utc(assignment?.shiftStart).format(),
        end: dayjs.utc(assignment?.shiftEnd).format(),
        staffId: assignment?.staffId,
        shiftId: assignment?.shiftId,
        className: `event ${classes[className]} ${
          getAssigmentById(assignment?.id)?.isUpdated ? "highlight" : ""
        } ${!isValidDate ? "invalid-date" : ""} ${isPairViolated ? "pair-violation" : ""}`,
      };
      works.push(work);
    }

    const offDays = schedule?.staffs?.find(
      (staff) => staff.id === selectedStaffId
    )?.offDays;
    const dates = getDatesBetween(
      dayjs(schedule.scheduleStartDate).format("DD.MM.YYYY"),
      dayjs(schedule.scheduleEndDate).format("DD.MM.YYYY")
    );
    let highlightedDates: string[] = [];

    dates.forEach((date) => {
      const transformedDate = dayjs(date, "DD-MM-YYYY").format("DD.MM.YYYY");
      if (offDays?.includes(transformedDate)) highlightedDates.push(date);
    });

    setHighlightedDates(highlightedDates);
    setEvents(works);

    if (works.length > 0 && calendarRef.current) {
      const firstEventDate = dayjs(works[0].start as string).toDate();
      calendarRef.current.getApi().gotoDate(firstEventDate);
    }
    
  };

  useEffect(() => {
    if (schedule?.staffs?.length > 0 && !selectedStaffId) {
      setSelectedStaffId(schedule.staffs[0].id);
    }
  }, [schedule, selectedStaffId]);
  

  useEffect(() => {
    if (selectedStaffId) {
      generateStaffBasedCalendar();
    }
  }, [selectedStaffId]);
  

  const RenderEventContent = ({ eventInfo }: any) => {
    return (
      <div className="event-content">
        <p>{eventInfo.event.title}</p>
      </div>
    );
  };

  const handleEventClick = (info: any) => {
    const event = info.event;
    const staff = getStaffById(event.extendedProps.staffId);
    const shift = getShiftById(event.extendedProps.shiftId);
    
    const pairResult = isPairConstraintViolated(event.extendedProps.staffId, dayjs(event.start).format("YYYY-MM-DD"));
    
    setSelectedEvent({
      staffName: staff?.name,
      shiftName: shift?.name,
      date: dayjs.utc(event.start).format("DD.MM.YYYY"),
      startTime: dayjs.utc(event.start).format("HH:mm"),
      endTime: dayjs.utc(event.end).format("HH:mm"),
      isPairViolated: pairResult.isPaired
    });
  };

  const handleEventDrop = (info: any) => {
    const { event } = info;
    const newStart = dayjs.utc(event.start).format();
    const newEnd = dayjs.utc(event.end).format();
    
    dispatch(updateEventDate({
      eventId: event.id,
      newStart,
      newEnd,
    }) as any);
  };

  return (
    <div className="calendar-section">
      <div className="calendar-wrapper">
        <div className="staff-list">
          {schedule?.staffs?.map((staff: any, index: number) => {
            const colorClass = `staff-color-${index % 16}`;
            
            return (
              <div
                key={staff.id}
                onClick={() => setSelectedStaffId(staff.id)}
                className={`staff ${staff.id === selectedStaffId ? "active" : ""} ${colorClass}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="20px"
                  viewBox="0 -960 960 960"
                  width="20px"
                >
                  <path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17-62.5t47-43.5q60-30 124.5-46T480-440q67 0 131.5 16T736-378q30 15 47 43.5t17 62.5v112H160Zm320-400q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm160 228v92h80v-32q0-11-5-20t-15-14q-14-8-29.5-14.5T640-332Zm-240-21v53h160v-53q-20-4-40-5.5t-40-1.5q-20 0-40 1.5t-40 5.5ZM240-240h80v-92q-15 5-30.5 11.5T260-306q-10 5-15 14t-5 20v32Zm400 0H320h320ZM480-640Z" />
                </svg>
                <span>{staff.name}</span>
              </div>
            );
          })}
        </div>
        <FullCalendar
          ref={calendarRef}
          locale={auth.language}
          plugins={getPlugins()}
          contentHeight={400}
          handleWindowResize={true}
          selectable={true}
          editable={true}
          eventOverlap={true}
          eventDurationEditable={false}
          initialDate={initialDate}
          events={events}
          firstDay={1}
          dayMaxEventRows={4}
          fixedWeekCount={true}
          showNonCurrentDates={true}
          timeZone="UTC"
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventContent={(eventInfo: any) => (
            <RenderEventContent eventInfo={eventInfo} />
          )}
          datesSet={(info: any) => {
            const prevButton = document.querySelector(
              ".fc-prev-button"
            ) as HTMLButtonElement;
            const nextButton = document.querySelector(
              ".fc-next-button"
            ) as HTMLButtonElement;

            if (
              calendarRef?.current?.getApi().getDate() &&
              !dayjs(schedule?.scheduleStartDate).isSame(
                calendarRef?.current?.getApi().getDate()
              )
            )
              setInitialDate(calendarRef?.current?.getApi().getDate());

            const startDiff = dayjs(info.start)
              .diff(
                dayjs(schedule.scheduleStartDate).subtract(1, "day"),
                "days"
              );
            const endDiff = dayjs(dayjs(schedule.scheduleEndDate)).diff(
              info.end,
              "days"
            );
            if (startDiff < 0 && startDiff > -35) prevButton.disabled = true;
            else prevButton.disabled = false;

            if (endDiff < 0 && endDiff > -32) nextButton.disabled = true;
            else nextButton.disabled = false;
          }}
          dayCellContent={({ date }) => {
            const found = validDates().includes(
              dayjs(date).format("YYYY-MM-DD")
            );
            
            const isHighlighted = highlightedDates.includes(
              dayjs(date).format("DD-MM-YYYY")
            );
            
            const dateStr = dayjs(date).format("YYYY-MM-DD");
            
            const pairResult = selectedStaffId ? 
              isPairConstraintViolated(selectedStaffId, dateStr) : 
              { isPaired: false, pairIndex: -1, pairedStaffId: null };
            
            let pairClass = '';
            if (pairResult.isPaired && pairResult.pairIndex >= 0) {
              const safeIndex = Math.max(0, pairResult.pairIndex % 16);
              pairClass = `pair-staff-${safeIndex}`;
              
            }

            return (
              <div
                className={`${found ? "" : "date-range-disabled"} ${
                  isHighlighted ? "highlighted-date-orange" : ""
                } ${pairClass}`}
              >
                {dayjs(date).date()}
              </div>
            );
          }}
        />
      </div>
      {selectedEvent && (
        <div className="event-details-popup">
          <div className="event-details-content">
            <h3>Event Details</h3>
            <p><strong>Staff:</strong> {selectedEvent.staffName}</p>
            <p><strong>Shift:</strong> {selectedEvent.shiftName}</p>
            <p><strong>Date:</strong> {selectedEvent.date}</p>
            <p><strong>Time:</strong> {selectedEvent.startTime} - {selectedEvent.endTime}</p>
            <button onClick={() => setSelectedEvent(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarContainer;
