//! The simulation clock: an integer tick counter and nothing else.
//!
//! No `Date`, no timers, no floating point anywhere. Whether the game is
//! PAUSED and how fast the player is watching are questions about a session,
//! not about a simulation: the shell owns both, converts real time into whole
//! ticks, and asks for the ticks it wants. The clock only counts them, which
//! is what keeps replay exact - and is why neither answer is stored here or in
//! a save.

use crate::error::EngineResult;
use crate::num::{is_safe_int, MAX_SAFE_INT};
use crate::refuse;

/// The most ticks one `advance` call may ask for.
///
/// A tick is a simulated minute and the loop that runs them is synchronous, so
/// the number here is also a promise about the frame: a million ticks is
/// roughly two simulated years, more than any real caller wants and still fast
/// enough to return. Anything above it is a caller mistake (a `MAX_VALUE`, a
/// bad subtraction), and answering "no" is the only way the tab stays alive -
/// `Number.MAX_SAFE_INTEGER` ticks at any speed at all is a frozen browser.
pub const MAX_ADVANCE_TICKS: i64 = 1_000_000;

#[derive(Clone, Debug)]
pub struct SimClock {
    tick: i64,
    sla_running: bool,
}

impl Default for SimClock {
    fn default() -> Self {
        Self {
            tick: 0,
            sla_running: true,
        }
    }
}

impl SimClock {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_parts(tick: i64, sla_running: bool) -> Self {
        Self { tick, sla_running }
    }

    pub fn now(&self) -> i64 {
        self.tick
    }

    /// Whether the ticks going past are ticks a service level counts.
    ///
    /// A world where nobody has said otherwise counts every minute, which is
    /// what a clock with no opinion about office hours has to mean. The world
    /// that HAS an opinion - a shift with a start and an end - turns this off
    /// while the desk is empty, and every unresolved ticket's deadline moves
    /// out by the minutes nobody was there to work in.
    pub fn sla_runs(&self) -> bool {
        self.sla_running
    }

    pub fn set_sla_running(&mut self, running: bool) {
        self.sla_running = running;
    }

    /// One tick. The world drives the loop so that whatever reacts to a tick
    /// runs between ticks, exactly as the TypeScript listener did.
    ///
    /// A clock nobody is watching does not stop: a paused GAME is a shell that
    /// stops asking for ticks, and the difference matters because a replay
    /// asks for all of them at once and must arrive at the same world.
    pub fn step(&mut self) -> bool {
        if self.tick >= MAX_SAFE_INT {
            return false;
        }

        self.tick += 1;
        true
    }

    /// How many ticks this clock will accept moving by, or the sentence that
    /// says why it will not. Checked against THIS clock rather than statically,
    /// because "how far can we go" depends on where we are.
    pub fn validate_advance(&self, ticks: f64) -> EngineResult<i64> {
        if !is_safe_int(ticks) || ticks < 0.0 {
            return refuse!("Clock advance must be a non-negative safe integer.");
        }

        let ticks = ticks as i64;

        if ticks > MAX_ADVANCE_TICKS {
            return refuse!(
                "Clock advance of {ticks} ticks is beyond the {MAX_ADVANCE_TICKS} tick limit for \
                 one call."
            );
        }

        match self.tick.checked_add(ticks) {
            Some(end) if end <= MAX_SAFE_INT => Ok(ticks),
            _ => refuse!("Clock advance would take the tick count past the safe integer range."),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::num::MAX_SAFE_INT_F64;

    #[test]
    fn counts_every_tick_it_is_asked_for() {
        let mut clock = SimClock::new();
        assert!(clock.step());
        assert!(clock.step());
        assert_eq!(clock.now(), 2);
        assert!(clock.step());
        assert_eq!(clock.now(), 3);
    }

    #[test]
    fn refuses_fractional_negative_and_broken_values() {
        let clock = SimClock::new();

        assert!(clock.validate_advance(1.5).is_err());
        assert!(clock.validate_advance(-1.0).is_err());
        assert!(clock.validate_advance(f64::NAN).is_err());
        assert_eq!(clock.validate_advance(3.0).expect("whole ticks"), 3);
    }

    /// A clock nobody has told about office hours counts every minute.
    #[test]
    fn counts_service_time_until_told_not_to() {
        let mut clock = SimClock::new();
        assert!(clock.sla_runs());

        clock.set_sla_running(false);
        assert!(!clock.sla_runs());
        // And it is a property of the clock, so it survives being rebuilt from
        // a save exactly as the tick does.
        assert!(!SimClock::from_parts(clock.now(), false).sla_runs());
    }

    /// The tab-freezing pair: a quadrillion ticks is a synchronous loop nobody
    /// survives, and a clock parked at the end of the safe range cannot take
    /// even one more without becoming a number the browser reads back wrong.
    #[test]
    fn refuses_advances_that_would_hang_or_overflow_the_clock() {
        let clock = SimClock::new();

        assert!(clock.validate_advance(MAX_ADVANCE_TICKS as f64).is_ok());
        assert!(clock.validate_advance((MAX_ADVANCE_TICKS + 1) as f64).is_err());
        assert!(clock.validate_advance(MAX_SAFE_INT_F64).is_err());
        assert!(clock.validate_advance(f64::MAX).is_err());
        assert!(clock.validate_advance(f64::INFINITY).is_err());

        let late = SimClock::from_parts(MAX_SAFE_INT, true);
        assert!(late.validate_advance(0.0).is_ok());
        assert!(late.validate_advance(1.0).is_err());

        let mut stuck = SimClock::from_parts(MAX_SAFE_INT, true);
        assert!(!stuck.step());
        assert_eq!(stuck.now(), MAX_SAFE_INT);
    }
}
