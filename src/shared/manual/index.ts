import type { Manual } from "../types";

import whyAHauntShouldListen from "./sections/why-a-haunt-should-listen.md?raw";
import anatomyOfAScare from "./sections/anatomy-of-a-scare.md?raw";
import bodiesThatMove from "./sections/bodies-that-move.md?raw";
import givingTheDeadAVoice from "./sections/giving-the-dead-a-voice.md?raw";
import stayingInCharacter from "./sections/staying-in-character.md?raw";
import theHalfSecondProblem from "./sections/the-half-second-problem.md?raw";
import sensingTheGuest from "./sections/sensing-the-guest.md?raw";
import theRoomController from "./sections/the-room-controller.md?raw";
import lightSoundAndFog from "./sections/light-sound-and-fog.md?raw";
import readingTheGroup from "./sections/reading-the-group.md?raw";
import theDirector from "./sections/the-director.md?raw";
import knowingWhenToStop from "./sections/knowing-when-to-stop.md?raw";
import theShowMustStop from "./sections/the-show-must-stop.md?raw";
import rehearsalAndTheMorningAfter from "./sections/rehearsal-and-the-morning-after.md?raw";
import servosSteppersAndPneumatics from "./sections/servos-steppers-and-pneumatics.md?raw";
import sensorsAndControllers from "./sections/sensors-and-controllers.md?raw";
import anatomyOfACharacterPrompt from "./sections/anatomy-of-a-character-prompt.md?raw";
import theCast from "./sections/the-cast.md?raw";

export const sampleManual: Manual = {
  id: "the-haunt-that-listens",
  title: "The Haunt That Listens",
  subtitle:
    "Building haunted houses with improvising animatronics, rooms that notice you, and scares that learn as you walk through",
  voice:
    "A theatrical, slightly unhinged veteran haunt builder with thirty-one Octobers behind them: a showman who talks like a carnival barker at midnight and relishes the dark, but who is also a meticulous engineer. Every flourish lands on something concrete — a torque rating, a latency budget, a fire-code rule. Addresses the reader directly as a fellow conspirator (“my dear builder”). Long gothic sentences, then short blunt ones. Gallows humour, never cruelty. Deadly serious about one thing: every guest walks out the exit, laughing or shaking, but unharmed.",

  chapters: [
    {
      id: "a-haunt-with-a-nervous-system",
      label: "1",
      title: "A Haunt With a Nervous System",
      sections: [
        {
          id: "why-a-haunt-should-listen",
          label: "1.1",
          title: "Why a Haunt Should Listen",
          summary: "Why a scare that hears you beats a scare on a timer, and what that costs.",
          status: "written",
          body: whyAHauntShouldListen,
        },
        {
          id: "anatomy-of-a-scare",
          label: "1.2",
          title: "The Anatomy of a Scare",
          summary: "The four organs of every scare — lure, hush, strike and release — and which ones a machine may run.",
          status: "unwritten",
          body: anatomyOfAScare,
        },
      ],
    },
    {
      id: "performers-without-a-pulse",
      label: "2",
      title: "Performers Without a Pulse",
      sections: [
        {
          id: "bodies-that-move",
          label: "2.1",
          title: "Bodies That Move",
          summary: "Choosing the muscle for each motion, and drawing the lines no figure may ever cross.",
          status: "unwritten",
          body: bodiesThatMove,
        },
        {
          id: "giving-the-dead-a-voice",
          label: "2.2",
          title: "Giving the Dead a Voice",
          summary: "The hear–think–speak loop: microphones, speech recognition, the model, the filter and the voice.",
          status: "unwritten",
          body: givingTheDeadAVoice,
        },
        {
          id: "staying-in-character",
          label: "2.3",
          title: "Staying in Character",
          summary: "Keeping an improvising ghost in its century for six hours and four hundred groups a night.",
          status: "unwritten",
          body: stayingInCharacter,
        },
        {
          id: "the-half-second-problem",
          label: "2.4",
          title: "The Half-Second Problem",
          summary: "Latency budgets, and the tricks that let a performer answer before the fear wears off.",
          status: "written",
          body: theHalfSecondProblem,
        },
      ],
    },
    {
      id: "rooms-that-notice",
      label: "3",
      title: "Rooms That Notice",
      sections: [
        {
          id: "sensing-the-guest",
          label: "3.1",
          title: "Sensing the Guest",
          summary: "What a room can know about the people in it, and what it should never try to know.",
          status: "written",
          body: sensingTheGuest,
        },
        {
          id: "the-room-controller",
          label: "3.2",
          title: "The Room Controller",
          summary: "The dull, reliable state machine in every room, and the rules no model can override.",
          status: "unwritten",
          body: theRoomController,
        },
        {
          id: "light-sound-and-fog",
          label: "3.3",
          title: "Light, Sound and Fog",
          summary: "Cueing lights, directional sound and fog so the whole room breathes as one creature.",
          status: "unwritten",
          body: lightSoundAndFog,
        },
      ],
    },
    {
      id: "scares-that-learn",
      label: "4",
      title: "Scares That Learn",
      sections: [
        {
          id: "reading-the-group",
          label: "4.1",
          title: "Reading the Group",
          summary: "Judging how frightened a group is from spacing, speed and sound — never from faces.",
          status: "unwritten",
          body: readingTheGroup,
        },
        {
          id: "the-director",
          label: "4.2",
          title: "The Director",
          summary: "A slower, smarter model that watches the whole house and decides how hard to push each group.",
          status: "written",
          body: theDirector,
        },
        {
          id: "knowing-when-to-stop",
          label: "4.3",
          title: "Knowing When to Stop",
          summary: "Telling real distress from fun fear, honouring the safe word, and turning the house down.",
          status: "unwritten",
          body: knowingWhenToStop,
        },
      ],
    },
    {
      id: "opening-night",
      label: "5",
      title: "Opening Night",
      sections: [
        {
          id: "the-show-must-stop",
          label: "5.1",
          title: "The Show Must Stop",
          summary: "E-stops, fire code and the hardware that ends the show when it has to.",
          status: "written",
          body: theShowMustStop,
        },
        {
          id: "rehearsal-and-the-morning-after",
          label: "5.2",
          title: "Rehearsal and the Morning After",
          summary: "Three nights of rehearsal, then the logs, the checklist and the repairs after every show.",
          status: "unwritten",
          body: rehearsalAndTheMorningAfter,
        },
      ],
    },
  ],

  appendices: [
    {
      id: "parts-and-sensors",
      label: "A",
      title: "Parts and Sensor Reference",
      sections: [
        {
          id: "servos-steppers-and-pneumatics",
          label: "A.1",
          title: "Servos, Steppers and Pneumatics",
          summary: "Actuator classes with voltages, torque and force, and where each one belongs.",
          status: "written",
          body: servosSteppersAndPneumatics,
        },
        {
          id: "sensors-and-controllers",
          label: "A.2",
          title: "Sensors and Controllers",
          summary: "Presence, distance and sound sensors, plus the controllers, network and power behind each room.",
          status: "unwritten",
          body: sensorsAndControllers,
        },
      ],
    },
    {
      id: "character-prompts",
      label: "B",
      title: "The Character Prompt Library",
      sections: [
        {
          id: "anatomy-of-a-character-prompt",
          label: "B.1",
          title: "Anatomy of a Character Prompt",
          summary: "The skeleton every performer prompt is built on, bone by bone.",
          status: "unwritten",
          body: anatomyOfACharacterPrompt,
        },
        {
          id: "the-cast",
          label: "B.2",
          title: "The Cast",
          summary: "Four ready-to-use performers, from the Widow of the Drowned Parlour to the Keeper of the Lamp Room.",
          status: "written",
          body: theCast,
        },
      ],
    },
  ],
};

export const SHOT_SECTIONS = {
  written: "sensing-the-guest",
  dense: "the-half-second-problem",
  unwritten: "the-room-controller",
  appendix: "servos-steppers-and-pneumatics",
} as const;
