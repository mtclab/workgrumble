//! One error type, because everything the boundary can go wrong with ends up
//! as the same thing to a caller: a sentence explaining the refusal.

use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EngineError(String);

impl EngineError {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }

    pub fn message(&self) -> &str {
        &self.0
    }

    pub fn into_message(self) -> String {
        self.0
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for EngineError {}

pub type EngineResult<T> = Result<T, EngineError>;

/// `Err(EngineError::new(format!(...)))` at every call site reads worse than
/// the thing it is refusing.
#[macro_export]
macro_rules! refuse {
    ($($argument:tt)*) => {
        Err($crate::error::EngineError::new(format!($($argument)*)))
    };
}
