//! Mulberry32, bit-identical to `rng.ts`.
//!
//! Every operation the JavaScript version performs is a 32-bit one (`Math.imul`,
//! `>>>`, `|`), so the whole generator is expressed here in `u32` wrapping
//! arithmetic - the same bits in the same order. A fork derives from the
//! PARENT SEED, never the parent's current state, which is why forking cannot
//! disturb the stream it came from. (`next_f64` is `next()` over there; the
//! bare name belongs to `Iterator` in Rust and reusing it reads as one.)

const UINT32_RANGE: f64 = 4_294_967_296.0;
const FNV32_OFFSET: u32 = 0x811c_9dc5;
const FNV32_PRIME: u32 = 0x0100_0193;

/// FNV-1a over UTF-16 code units, low byte then high byte - exactly what
/// `charCodeAt` feeds the TypeScript version.
fn hash_label(label: &str) -> u32 {
    let mut hash = FNV32_OFFSET;

    for unit in label.encode_utf16() {
        hash ^= u32::from(unit & 0xff);
        hash = hash.wrapping_mul(FNV32_PRIME);
        hash ^= u32::from(unit >> 8);
        hash = hash.wrapping_mul(FNV32_PRIME);
    }

    hash
}

fn mix_seeds(parent_seed: u32, label_hash: u32) -> u32 {
    let mut mixed = parent_seed ^ label_hash ^ 0x9e37_79b9;
    mixed = (mixed ^ (mixed >> 16)).wrapping_mul(0x21f0_aaad);
    mixed = (mixed ^ (mixed >> 15)).wrapping_mul(0x735a_2d97);
    mixed ^ (mixed >> 15)
}

#[derive(Clone, Debug)]
pub struct Rng {
    seed: u32,
    state: u32,
}

impl Rng {
    pub fn new(seed: u32) -> Self {
        Self { seed, state: seed }
    }

    /// Rebuilds a generator mid-stream, for `restore`.
    pub fn from_parts(seed: u32, state: u32) -> Self {
        Self { seed, state }
    }

    pub fn seed(&self) -> u32 {
        self.seed
    }

    pub fn state(&self) -> u32 {
        self.state
    }

    pub fn next_f64(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut value = self.state;
        value = (value ^ (value >> 15)).wrapping_mul(value | 1);
        value ^= value.wrapping_add((value ^ (value >> 7)).wrapping_mul(value | 61));
        f64::from(value ^ (value >> 14)) / UINT32_RANGE
    }

    /// Inclusive on both ends, like the TypeScript original.
    pub fn int(&mut self, min: i64, max: i64) -> i64 {
        if max < min {
            // The reference throws; the engine has no throw to give, and a
            // reversed range has exactly one sane reading.
            return min;
        }

        let range = (max - min + 1) as f64;
        min + (self.next_f64() * range).floor() as i64
    }

    pub fn pick<'a, Item>(&mut self, items: &'a [Item]) -> Option<&'a Item> {
        if items.is_empty() {
            return None;
        }

        let index = self.int(0, items.len() as i64 - 1);
        items.get(index as usize)
    }

    pub fn fork(&self, label: &str) -> Self {
        Self::new(mix_seeds(self.seed, hash_label(label)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produces_the_committed_mulberry32_sequence() {
        let mut rng = Rng::new(1);

        assert!((rng.next_f64() - 0.6270739405881613).abs() < 1e-15);
        assert!((rng.next_f64() - 0.002735721180215).abs() < 1e-15);
        assert!((rng.next_f64() - 0.5274470399599522).abs() < 1e-15);
    }

    #[test]
    fn generates_inclusive_integers() {
        let mut left = Rng::new(23);
        let mut right = Rng::new(23);
        let left_values: Vec<i64> = (0..30).map(|_| left.int(-2, 4)).collect();
        let right_values: Vec<i64> = (0..30).map(|_| right.int(-2, 4)).collect();

        assert_eq!(left_values, right_values);
        assert!(left_values.iter().all(|value| (-2..=4).contains(value)));
        assert!(left_values.contains(&-2));
        assert!(left_values.contains(&4));
    }

    #[test]
    fn picks_deterministically_and_refuses_an_empty_slice() {
        let items = ["a", "b", "c"];
        assert_eq!(Rng::new(8).pick(&items), Rng::new(8).pick(&items));
        assert_eq!(Rng::new(8).pick::<&str>(&[]), None);
    }

    #[test]
    fn forks_by_seed_and_label_without_consuming_the_parent() {
        let mut parent = Rng::new(99);
        let mut expected_parent = Rng::new(99);
        let mut first_child = parent.fork("ticket:printer");

        assert_eq!(parent.next_f64(), expected_parent.next_f64());

        let mut second_child = parent.fork("ticket:printer");
        let mut other_child = parent.fork("ticket:mail");

        assert_eq!(first_child.next_f64(), second_child.next_f64());
        assert_ne!(second_child.next_f64(), other_child.next_f64());
        assert_eq!(parent.next_f64(), expected_parent.next_f64());
        assert_eq!(parent.next_f64(), expected_parent.next_f64());
    }

    #[test]
    fn hashes_labels_over_utf16_code_units() {
        // Two different labels must not collide into the same child stream.
        assert_ne!(hash_label("a"), hash_label("b"));
        assert_ne!(hash_label("kääntää"), hash_label("kaantaa"));
    }
}
