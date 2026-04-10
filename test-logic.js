// Logic module tests using Node.js WebCrypto
// Run: node test-logic.js

const crypto = require('crypto').webcrypto;

// Setup global window.crypto for logic.js (Node environment)
global.window = {
    crypto: {
        subtle: crypto.subtle,
        getRandomValues: (arr) => crypto.getRandomValues(arr)
    }
};
global.window.btoa = (buffer) => Buffer.from(buffer).toString('base64');
global.window.atob = (base64) => Buffer.from(base64, 'base64');
global.window.TextEncoder = TextEncoder;
global.window.TextDecoder = TextDecoder;

// Load the logic module
const logic = require('./logic.js');

// Test framework
let passed = 0, failed = 0;
const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        throw new Error(message || `Expected ${expectedStr} but got ${actualStr}`);
    }
}

// ==================== CRUD TESTS ====================

test('createPrompt creates a valid prompt object', async () => {
    const detailState = {
        title: 'Test Prompt',
        body: 'Hello world',
        notes: 'Some notes',
        folderId: 123,
        tags: ['tag1', 'tag2'],
        isLocked: false
    };

    const prompt = await logic.createPrompt(detailState);

    assert(prompt.id !== undefined, 'Should have an ID');
    assert(prompt.title === 'Test Prompt', 'Title should match');
    assert(prompt.body === 'Hello world', 'Body should match');
    assert(prompt.notes === 'Some notes', 'Notes should match');
    assert(prompt.folderId === 123, 'Folder ID should match');
    assertDeepEqual(prompt.tags, ['tag1', 'tag2'], 'Tags should match');
    assert(prompt.isLocked === false, 'Should not be locked');
    assert(prompt.isFavorite === false, 'Should not be favorite by default');
    assert(prompt.dateCreated !== undefined, 'Should have dateCreated');
});

test('createPrompt with lockInfo creates encrypted prompt', async () => {
    const detailState = {
        title: 'Secret Prompt',
        body: 'Secret content',
        notes: 'Secret notes',
        folderId: null,
        tags: [],
        isLocked: false
    };

    const lockInfo = { password: 'myPassword' };
    const prompt = await logic.createPrompt(detailState, lockInfo);

    assert(prompt.isLocked === true, 'Should be locked');
    assert(prompt.body !== 'Secret content', 'Body should be encrypted');
    assert(prompt.notes !== 'Secret notes', 'Notes should be encrypted');
    assert(prompt.passwordCheck !== undefined, 'Should have passwordCheck');
    assert(typeof prompt.body === 'object', 'Encrypted body should be an object');
    assert(prompt.body.ct && prompt.body.iv && prompt.body.salt, 'Encrypted object should have ct, iv, salt');
});

test('updatePrompt updates all fields', async () => {
    const initialPrompt = {
        id: 1,
        dateCreated: 1000,
        dateModified: 1000,
        isFavorite: false,
        title: 'Old Title',
        body: 'Old Body',
        notes: 'Old Notes',
        folderId: null,
        tags: ['old'],
        isLocked: false
    };

    const detailState = {
        title: 'New Title',
        body: 'New Body',
        notes: 'New Notes',
        folderId: 456,
        tags: ['new1', 'new2'],
        isLocked: false
    };

    const updated = logic.updatePrompt(initialPrompt, detailState);

    assert(updated.id === 1, 'ID should remain');
    assert(updated.title === 'New Title', 'Title updated');
    assert(updated.body === 'New Body', 'Body updated');
    assert(updated.folderId === 456, 'Folder ID updated');
    assertDeepEqual(updated.tags, ['new1', 'new2'], 'Tags updated');
    assert(updated.dateModified > initialPrompt.dateModified, 'dateModified should be updated');
});

test('updatePrompt preserves existing encryption when re-locking', async () => {
    // Prompt originally unlocked
    const prompt = {
        id: 1,
        title: 'Test',
        body: 'Plain body',
        notes: 'Plain notes',
        isLocked: false
    };

    // Lock it with a new password
    const detailState = {
        title: 'Test',
        body: 'Plain body',
        notes: 'Plain notes',
        tags: [],
        folderId: null
    };

    const locked = await logic.updatePrompt(prompt, detailState, { password: 'newPass' });

    assert(locked.isLocked === true, 'Should be locked');
    assert(locked.body !== 'Plain body', 'Body should be encrypted');
    assert(locked.passwordCheck !== undefined, 'Should have new passwordCheck');
});

test('deletePrompt removes prompt from array', () => {
    const prompts = [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
        { id: 3, title: 'C' }
    ];

    const result = logic.deletePrompt(2, prompts);
    assert(result.length === 2, 'Should have 2 prompts');
    assert(!result.find(p => p.id === 2), 'Prompt 2 should be gone');
});

test('bulkDeletePrompts removes multiple prompts', () => {
    const prompts = [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
        { id: 3, title: 'C' },
        { id: 4, title: 'D' }
    ];

    const result = logic.bulkDeletePrompts([2, 4], prompts);
    assert(result.length === 2, 'Should have 2 prompts');
    assert(result.find(p => p.id === 1), 'Prompt 1 should remain');
    assert(result.find(p => p.id === 3), 'Prompt 3 should remain');
});

// ==================== SEARCH TESTS ====================

test('searchPrompts finds matches in title', () => {
    const prompts = [
        { id: 1, title: 'Hello World', body: '', tags: [] },
        { id: 2, title: 'Foo Bar', body: '', tags: [] },
        { id: 3, title: 'Testing', body: '', tags: [] }
    ];
    const folders = [];

    const results = logic.searchPrompts('hello', prompts, folders);
    assert(results.length === 1, 'Should find 1 result');
    assert(results[0].id === 1, 'Should find the right prompt');
});

test('searchPrompts finds matches in body', () => {
    const prompts = [
        { id: 1, title: 'A', body: 'This contains keyword', tags: [] },
        { id: 2, title: 'B', body: 'No match here', tags: [] }
    ];
    const folders = [];

    const results = logic.searchPrompts('keyword', prompts, folders);
    assert(results.length === 1 && results[0].id === 1, 'Should find by body');
});

test('searchPrompts finds matches in tags', () => {
    const prompts = [
        { id: 1, title: 'A', body: '', tags: ['important', 'work'] },
        { id: 2, title: 'B', body: '', tags: ['personal'] }
    ];
    const folders = [];

    const results = logic.searchPrompts('important', prompts, folders);
    assert(results.length === 1 && results[0].id === 1, 'Should find by tag');
});

test('searchPrompts is case-insensitive', () => {
    const prompts = [
        { id: 1, title: 'HELLO world', body: '', tags: [] }
    ];
    const folders = [];

    const results = logic.searchPrompts('HeLLo', prompts, folders);
    assert(results.length === 1, 'Should match case-insensitively');
});

test('searchPrompts respects lock status with decryptedCache', () => {
    const folder = { id: 1, isLocked: true };
    const prompts = [
        { id: 1, title: 'Locked Prompt', body: 'encrypted content', notes: '', folderId: 1, isLocked: false },
        { id: 2, title: 'Normal Prompt', body: 'plain text', notes: '', folderId: null, isLocked: false }
    ];
    const folders = [folder];

    // Without cache, locked prompt should not be searchable
    const results1 = logic.searchPrompts('encrypted', prompts, folders);
    assert(results1.length === 0, 'Encrypted content should not be searchable without cache');

    // With cache, should be searchable
    const decryptedCache = {
        1: { body: 'encrypted content', notes: '' }
    };
    const results2 = logic.searchPrompts('encrypted', prompts, folders, decryptedCache);
    assert(results2.length === 1 && results2[0].id === 1, 'Should find with cache');
});

// ==================== TAG OPERATIONS TESTS ====================

test('addGlobalTag adds and deduplicates', () => {
    const current = ['a', 'b'];
    const result = logic.addGlobalTag('c', current);
    assertDeepEqual(result, ['a', 'b', 'c']);

    const resultDedup = logic.addGlobalTag('a', current);
    assertDeepEqual(resultDedup, ['a', 'b']);
});

test('renameTag updates global tags and all prompts', () => {
    const globalTags = ['tag1', 'tag2'];
    const prompts = [
        { id: 1, tags: ['tag1', 'tag2'] },
        { id: 2, tags: ['tag1'] },
        { id: 3, tags: ['other'] }
    ];

    const { globalTags: newTags, prompts: newPrompts, updatedPromptIds } = logic.renameTag('tag1', 'newTag', globalTags, prompts);

    assertDeepEqual(newTags, ['newTag', 'tag2']);
    assert(updatedPromptIds.has(1), 'Prompt 1 should be updated');
    assert(updatedPromptIds.has(2), 'Prompt 2 should be updated');
    assert(!updatedPromptIds.has(3), 'Prompt 3 not updated');
    assert(newPrompts[0].tags.includes('newTag'), 'Prompt 1 should have newTag');
    assert(!newPrompts[0].tags.includes('tag1'), 'Prompt 1 should not have old tag');
});

test('deleteTag removes from global tags and all prompts', () => {
    const globalTags = ['keep', 'deleteMe', 'other'];
    const prompts = [
        { id: 1, tags: ['keep', 'deleteMe'] },
        { id: 2, tags: ['deleteMe'] },
        { id: 3, tags: ['keep'] }
    ];

    const { globalTags: newTags, prompts: newPrompts, deletedCount } = logic.deleteTag('deleteMe', globalTags, prompts);

    assertDeepEqual(newTags, ['keep', 'other']);
    assert(deletedCount === 2, 'Should have removed from 2 prompts');
    assert(!newPrompts[0].tags.includes('deleteMe'), 'Prompt 1 tag removed');
    assert(!newPrompts[1].tags.includes('deleteMe'), 'Prompt 2 tag removed');
});

// ==================== DRAG-DROP / MOVING TESTS ====================

test('movePromptToFolder changes folderId and updates modified time', () => {
    const prompt = { id: 1, folderId: 5, dateModified: 1000 };
    const folders = [];

    const moved = logic.movePromptToFolder(prompt, 10, folders);

    assert(moved.folderId === 10, 'Folder ID should change');
    assert(moved.dateModified > 1000, 'dateModified should be updated');
    assert(moved.id === prompt.id, 'ID should be preserved');
});

test('bulkMovePrompts updates all prompts', () => {
    const prompts = [
        { id: 1, folderId: 1 },
        { id: 2, folderId: 2 },
        { id: 3, folderId: 1 }
    ];

    const moved = logic.bulkMovePrompts([prompts[0], prompts[2]], 10);

    assert(moved[0].folderId === 10, 'First should be moved');
    assert(moved[1].folderId === 10, 'Third should be moved (second in moved array)');
    // The second item in moved array corresponds to prompts[2] which is the third prompt in original
});

// ==================== FOLDER OPERATIONS TESTS ====================

test('createFolder creates folder with generated ID', () => {
    const folder = logic.createFolder('My Folder');
    assert(folder.name === 'My Folder', 'Name should match');
    assert(folder.id !== undefined, 'Should have ID');
    assert(folder.isLocked === false, 'Should not be locked by default');
});

test('renameFolder updates name', () => {
    const folder = { id: 1, name: 'Old Name', isLocked: false };
    const renamed = logic.renameFolder(folder, 'New Name');
    assert(renamed.name === 'New Name', 'Name should change');
    assert(renamed.id === 1, 'ID preserved');
});

test('deleteFolder removes from array', () => {
    const folders = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' }
    ];

    const result = logic.deleteFolder(2, folders);
    assert(result.length === 2, 'Should have 2 folders');
    assert(!result.find(f => f.id === 2), 'Folder 2 removed');
});

test('toggleFolderLock locks with password', () => {
    const folder = { id: 1, name: 'Test', isLocked: false };
    const locked = logic.toggleFolderLock(folder, true, 'password123');

    assert(locked.isLocked === true, 'Should be locked');
    assert(locked.passwordCheck !== undefined, 'Should have passwordCheck');
});

test('toggleFolderLock unlocks clears passwordCheck', () => {
    const folder = { id: 1, name: 'Test', isLocked: true, passwordCheck: { ct: 'x' } };
    const unlocked = logic.toggleFolderLock(folder, false);

    assert(unlocked.isLocked === false, 'Should be unlocked');
    assert(unlocked.passwordCheck === null, 'passwordCheck should be null');
});

test('toggleFolderLock throws without password when locking', () => {
    const folder = { id: 1, name: 'Test', isLocked: false };
    let threw = false;
    try {
        logic.toggleFolderLock(folder, true, null);
    } catch (e) {
        threw = true;
        assert(e.message.includes('Password required'), 'Should throw appropriate error');
    }
    assert(threw, 'Should throw when locking without password');
});

// ==================== FILTER & SORT TESTS ====================

test('filterPrompts filters by tag', () => {
    const prompts = [
        { id: 1, tags: ['work', 'important'] },
        { id: 2, tags: ['personal'] },
        { id: 3, tags: ['work'] }
    ];
    const folders = [];

    const results = logic.filterPrompts(prompts, folders, { type: 'tag', id: 'work' });
    assert(results.length === 2, 'Should have 2 work prompts');
});

test('filterPrompts filters by favorites', () => {
    const prompts = [
        { id: 1, isFavorite: true, folderId: null },
        { id: 2, isFavorite: false, folderId: null },
        { id: 3, isFavorite: true, folderId: null }
    ];
    const folders = [];

    const results = logic.filterPrompts(prompts, folders, { type: 'folder', id: 'favorites' });
    assert(results.length === 2, 'Should have 2 favorites');
});

test('filterPrompts filters by locked status considering folder locks', () => {
    const prompts = [
        { id: 1, isLocked: true, folderId: 1 },
        { id: 2, isLocked: false, folderId: null },
        { id: 3, isLocked: false, folderId: 2 },
        { id: 4, isLocked: true, folderId: null }
    ];
    const folders = [
        { id: 2, isLocked: true } // folder 2 is locked
    ];

    const results = logic.filterPrompts(prompts, folders, { type: 'folder', id: 'locked' });
    // Prompts 1 (individually locked), 3 (folder locked), 4 (individually locked)
    assert(results.length === 3, 'Should include individually locked and folder-locked prompts');
    assert(results.find(p => p.id === 1), 'Should include prompt 1');
    assert(results.find(p => p.id === 3), 'Should include prompt 3 (folder locked)');
    assert(results.find(p => p.id === 4), 'Should include prompt 4');
});

test('filterPrompts filters by folder', () => {
    const prompts = [
        { id: 1, folderId: 5 },
        { id: 2, folderId: 10 },
        { id: 3, folderId: 5 }
    ];
    const folders = [];

    const results = logic.filterPrompts(prompts, folders, { type: 'folder', id: 5 });
    assert(results.length === 2, 'Should have 2 prompts in folder 5');
});

test('sortPrompts sorts by dateCreated_desc', () => {
    const prompts = [
        { id: 1, dateCreated: 1000 },
        { id: 2, dateCreated: 3000 },
        { id: 3, dateCreated: 2000 }
    ];

    const sorted = logic.sortPrompts(prompts, 'dateCreated_desc');
    assert(sorted[0].id === 2, 'Newest first');
    assert(sorted[2].id === 1, 'Oldest last');
});

test('sortPrompts sorts by title_asc', () => {
    const prompts = [
        { id: 1, title: 'Zebra' },
        { id: 2, title: 'Apple' },
        { id: 3, title: 'Mango' }
    ];

    const sorted = logic.sortPrompts(prompts, 'title_asc');
    assert(sorted[0].title === 'Apple', 'A first');
    assert(sorted[2].title === 'Zebra', 'Z last');
});

// ==================== STATS TESTS ====================

test('countPromptsInFolder counts correctly', () => {
    const prompts = [
        { id: 1, folderId: 1 },
        { id: 2, folderId: 2 },
        { id: 3, folderId: 1 },
        { id: 4, folderId: null }
    ];

    assert(logic.countPromptsInFolder(prompts, 1) === 2, 'Folder 1 should have 2');
    assert(logic.countPromptsInFolder(prompts, 2) === 1, 'Folder 2 should have 1');
    assert(logic.countPromptsInFolder(prompts, 3) === 0, 'Folder 3 should have 0');
    assert(logic.countPromptsInFolder(prompts, null) === 1, 'No folder should have 1');
});

test('countPromptsByTag counts correctly', () => {
    const prompts = [
        { id: 1, tags: ['a', 'b'] },
        { id: 2, tags: ['a'] },
        { id: 3, tags: ['c'] }
    ];

    assert(logic.countPromptsByTag(prompts, 'a') === 2, 'Tag a appears in 2 prompts');
    assert(logic.countPromptsByTag(prompts, 'b') === 1, 'Tag b in 1');
    assert(logic.countPromptsByTag(prompts, 'c') === 1, 'Tag c in 1');
    assert(logic.countPromptsByTag(prompts, 'd') === 0, 'Tag d in 0');
});

test('countLockedPrompts counts individual and folder locks', () => {
    const prompts = [
        { id: 1, isLocked: true, folderId: 1 },
        { id: 2, isLocked: false, folderId: 2 },
        { id: 3, isLocked: false, folderId: 1 },
        { id: 4, isLocked: true, folderId: null }
    ];
    const folders = [
        { id: 1, isLocked: true }, // folder 1 locked
        { id: 2, isLocked: false }
    ];

    assert(logic.countLockedPrompts(prompts, folders) === 3, 'Should count: prompt 1 (indiv + folder), prompt 3 (folder), prompt 4 (indiv)');
});

// ==================== IMPORT/EXPORT SERIALIZATION ====================

test('serializeExport returns deep copy', () => {
    const prompts = [{ id: 1, body: 'original' }];
    const folders = [{ id: 1, name: 'Folder 1' }];
    const tags = ['tag1', 'tag2'];

    const exportData = logic.serializeExport(prompts, folders, tags);

    assertDeepEqual(exportData.prompts, prompts);
    assertDeepEqual(exportData.folders, folders);
    assertDeepEqual(exportData.globalTags, tags);

    // Mutate originals
    prompts[0].body = 'modified';
    assert(exportData.prompts[0].body === 'original', 'Export copy should not be affected');
});

test('importData with isPartial merges without overwriting', () => {
    const existingPrompts = [
        { id: 1, title: 'Existing A' },
        { id: 2, title: 'Existing B' }
    ];
    const incoming = [
        { id: 2, title: 'Updated B' },
        { id: 3, title: 'New C' }
    ];

    const result = logic.importData(
        { prompts: incoming },
        existingPrompts,
        [],
        [],
        true // isPartial
    );

    assert(result.prompts.length === 3, 'Should have 3 prompts total (add new, keep existing)');
    // Existing A unchanged, Existing B unchanged (not overwritten), New C added
    const prompt1 = result.prompts.find(p => p.id === 1);
    const prompt2 = result.prompts.find(p => p.id === 2);
    const prompt3 = result.prompts.find(p => p.id === 3);

    assert(prompt1.title === 'Existing A', 'Existing A should remain unchanged');
    assert(prompt2.title === 'Existing B', 'Existing B should NOT be overwritten');
    assert(prompt3.title === 'New C', 'New C should be added');
});

test('importData without isPartial replaces all', () => {
    const existing = [{ id: 1, title: 'Old' }];
    const incoming = [{ id: 2, title: 'New' }];

    const result = logic.importData(
        { prompts: incoming, folders: [], globalTags: [] },
        existing,
        [],
        [],
        false // isPartial
    );

    assert(result.prompts.length === 1 && result.prompts[0].id === 2, 'Should be replaced');
});

// ==================== RUN TESTS ====================

(async () => {
    console.log('\n=== PromptCat Logic Tests ===\n');

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`\x1b[32m✓\x1b[0m ${name}`);
            passed++;
        } catch (err) {
            console.log(`\x1b[31m✗\x1b[0m ${name}`);
            console.log(`  \x1b[31m${err.message}\x1b[0m`);
            failed++;
        }
    }

    console.log(`\n=== Total: ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
})();
