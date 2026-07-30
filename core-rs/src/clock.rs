//! The simulation clock: an integer tick counter and nothing else.
//!
//! No `Date`, no timers, no floating point in the count. Speed is carried but
//! never applied here - the caller converts real time into whole ticks, which
//! is what keeps replay exact.

use crate::error::EngineResult;
use crate::refuse;

#[derive(Clone, Debug)]
pub struct SimClock {
    tick: i64,
    paused: bool,
    speed: f64,
}

impl Default for SimClock {
    fn default() -> Self {
        Self {
            tick: 0,
            paused: false,
            speed: 1.0,
        }
    }
}

impl SimClock {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_parts(tick: i64, paused: bool, speed: f64) -> Self {
        Self {
            tick,
            paused,
            speed,
        }
    }

    pub fn now(&self) -> i64 {
        self.tick
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn speed(&self) -> f64 {
        self.speed
    }

    pub fn set_speed(&mut self, speed: f64) -> EngineResult<()> {
        if !speed.is_finite() || speed <= 0.0 {
            return refuse!("Clock speed must be a positive finite number.");
        }

        self.speed = speed;
        Ok(())
    }

    pub fn pause(&mut self) {
        self.paused = true;
    }

    pub fn resume(&mut self) {
        self.paused = false;
    }

    /// One tick. The world drives the loop so that whatever reacts to a tick
    /// runs between ticks, exactly as the TypeScript listener did.
    pub fn step(&mut self) -> bool {
        if self.paused {
            return false;
        }

        self.tick += 1;
        true
    }

    pub fn validate_advance(ticks: f64) -> EngineResult<i64> {
        if !ticks.is_finite() || ticks.fract() != 0.0 || ticks < 0.0 {
            return refuse!("Clock advance must be a non-negative safe integer.");
        }

        Ok(ticks as i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steps_and_pauses() {
        let mut clock = SimClock::new();
        assert!(clock.step());
        assert!(clock.step());
        assert_eq!(clock.now(), 2);

        clock.pause();
        assert!(!clock.step());
        assert_eq!(clock.now(), 2);

        clock.resume();
        assert!(clock.step());
        assert_eq!(clock.now(), 3);
    }

    #[test]
    fn refuses_fractional_negative_and_broken_values() {
        assert!(SimClock::validate_advance(1.5).is_err());
        assert!(SimClock::validate_advance(-1.0).is_err());
        assert!(SimClock::validate_advance(f64::NAN).is_err());
        assert_eq!(SimClock::validate_advance(3.0).expect("whole ticks"), 3);

        let mut clock = SimClock::new();
        assert!(clock.set_speed(0.0).is_err());
        assert!(clock.set_speed(2.0).is_ok());
        assert_eq!(clock.speed(), 2.0);
    }
}
