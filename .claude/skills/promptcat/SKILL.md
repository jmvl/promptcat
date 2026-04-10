```markdown
# promptcat Development Patterns

> Auto-generated skill from repository analysis

## Overview
The `promptcat` repository is a JavaScript codebase focused on modular, test-driven feature development without reliance on a specific framework. It emphasizes clear coding conventions, automated testing, and diligent documentation. This skill will teach you how to contribute features, write tests, and maintain documentation in alignment with the project's established patterns.

## Coding Conventions

- **File Naming:**  
  Use camelCase for file names.  
  _Example:_  
  ```
  logic.js
  testLogic.js
  progress.txt
  ```

- **Import Style:**  
  Use relative imports for modules.  
  _Example:_  
  ```js
  import { myFunction } from './utils.js';
  ```

- **Export Style:**  
  Use named exports.  
  _Example:_  
  ```js
  // In logic.js
  export function processInput(input) { ... }
  ```

- **Commit Messages:**  
  Follow the [Conventional Commits](https://www.conventionalcommits.org/) format, using the `feat` prefix for new features.  
  _Example:_  
  ```
  feat: add prompt parsing logic to logic.js
  ```

## Workflows

### Feature Development with Tests and Documentation
**Trigger:** When adding a new feature or core logic to the codebase, along with corresponding tests and documentation.  
**Command:** `/new-feature`

1. **Implement or Refactor Core Logic**  
   - Create or update a logic file (e.g., `logic.js`).
   - Use camelCase for file names and named exports.
   - Example:
     ```js
     // logic.js
     export function generatePrompt(input) {
       // implementation
     }
     ```

2. **Create or Update Automated Test Suite**  
   - Add or update test files matching the pattern `*.test.*` (e.g., `test-logic.js`, `test-crypto.js`, `test-schema.html`).
   - Write tests to cover new or changed logic.
   - Example:
     ```js
     // test-logic.js
     import { generatePrompt } from './logic.js';

     // Pseudocode for test
     describe('generatePrompt', () => {
       it('should return expected output', () => {
         // test implementation
       });
     });
     ```

3. **Update Progress Tracking and Documentation**  
   - Edit `progress.txt` to reflect the new feature or changes.
   - Update `DB_SCHEMA.md` or other relevant documentation files as needed.

4. **Commit Changes**  
   - Use a conventional commit message with the `feat` prefix.
   - Example:
     ```
     feat: implement prompt generation and add tests
     ```

## Testing Patterns

- **Test File Naming:**  
  Test files follow the `*.test.*` pattern (e.g., `test-logic.js`, `test-crypto.js`, `test-schema.html`).

- **Test Structure:**  
  Tests are colocated with or near the logic they test, and use named imports for the functions under test.

- **Framework:**  
  No specific testing framework is enforced; structure tests for clarity and coverage.

- **Example Test:**
  ```js
  // test-logic.js
  import { generatePrompt } from './logic.js';

  describe('generatePrompt', () => {
    it('should handle empty input', () => {
      // test implementation
    });
  });
  ```

## Commands

| Command      | Purpose                                                       |
|--------------|---------------------------------------------------------------|
| /new-feature | Start the workflow for adding a new feature with tests & docs |

```