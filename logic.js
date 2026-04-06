/**
 * PromptCat Core Business Logic
 * Pure functions for prompt management, tag operations, search, and drag-drop reordering
 * No DOM dependencies - all UI state is passed as parameters
 */

const PromptCatLogic = (() => {
    'use strict';

    // ==================== CRUD OPERATIONS ====================

    /**
     * Creates a new prompt object
     * @param {Object} detailState - { title, body, notes, folderId, tags, isLocked }
     * @param {Object} lockInfo - { password } if locked, null otherwise
     * @returns {Promise<Object>} New prompt object with generated ID and timestamps
     */
    async function createPrompt(detailState, lockInfo = null) {
        const now = Date.now();
        const prompt = {
            id: now,
            dateCreated: now,
            dateModified: now,
            isFavorite: false,
            title: detailState.title || '',
            body: detailState.body || '',
            notes: detailState.notes || '',
            folderId: detailState.folderId || null,
            tags: [...(detailState.tags || [])],
            isLocked: lockInfo ? true : false
        };

        if (lockInfo && lockInfo.password) {
            prompt.body = await encryptContent(prompt.body, lockInfo.password);
            prompt.notes = await encryptContent(prompt.notes, lockInfo.password);
            prompt.passwordCheck = await createPasswordCheck(String(prompt.id), lockInfo.password);
        }

        return prompt;
    }

    /**
     * Updates an existing prompt with detail state
     * @param {Object} prompt - Existing prompt object
     * @param {Object} detailState - { title, body, notes, folderId, tags }
     * @param {Object} lockInfo - { password } if locked, null to unlock
     * @param {Object} existingPassword - Current password if already locked
     * @returns {Object} Updated prompt object
     */
    function updatePrompt(prompt, detailState, lockInfo = null, existingPassword = null) {
        const updated = { ...prompt };
        updated.title = detailState.title || '';
        updated.folderId = detailState.folderId || null;
        updated.tags = [...(detailState.tags || [])];
        updated.dateModified = Date.now();

        const body = detailState.body || '';
        const notes = detailState.notes || '';

        if (lockInfo && lockInfo.password) {
            // Locking (or re-locking with new password)
            updated.isLocked = true;
            updated.body = encryptContent(body, lockInfo.password);
            updated.notes = encryptContent(notes, lockInfo.password);
            updated.passwordCheck = encryptCheck(String(prompt.id), lockInfo.password);
        } else if (existingPassword && prompt.isLocked) {
            // Re-encrypting with current password (update content)
            updated.body = encryptContent(body, existingPassword);
            updated.notes = encryptContent(notes, existingPassword);
        } else {
            // Plaintext (unlocked)
            updated.isLocked = false;
            updated.body = body;
            updated.notes = notes;
            delete updated.passwordCheck;
        }

        return updated;
    }

    /**
     * Soft-delete a prompt (marks as deleted but keeps in array)
     * Note: Actual deletion from storage is done via storage.bulkRemove
     * @param {number} promptId - ID of prompt to delete
     * @param {Array} prompts - Current prompts array
     * @returns {Array} New prompts array without the deleted prompt
     */
    function deletePrompt(promptId, prompts) {
        return prompts.filter(p => p.id !== promptId);
    }

    /**
     * Bulk delete prompts
     * @param {Array<number>} ids - Array of prompt IDs to delete
     * @param {Array} prompts - Current prompts array
     * @returns {Array} New prompts array without deleted prompts
     */
    function bulkDeletePrompts(ids, prompts) {
        const deletedSet = new Set(ids);
        return prompts.filter(p => !deletedSet.has(p.id));
    }

    // ==================== SEARCH ====================

    /**
     * Search prompts by query string
     * @param {string} query - Search query (lowercased)
     * @param {Array} prompts - Prompts to search
     * @param {Array} folders - Folders for lock status
     * @param {Object} decryptedCache - Cache of decrypted content { promptId: { body, notes } }
     * @returns {Array} Matching prompts with optional matchContext
     */
    function searchPrompts(query, prompts, folders, decryptedCache = {}) {
        if (!query) return [];

        const lowerQuery = query.toLowerCase();

        return prompts.filter(p => {
            const folder = folders.find(f => f.id === p.folderId);
            const isLockedByDB = (folder && folder.isLocked) || p.isLocked;

            let searchableBody = '';
            let searchableNotes = '';

            if (!isLockedByDB) {
                searchableBody = p.body || '';
                searchableNotes = p.notes || '';
            } else {
                const cached = decryptedCache[p.id];
                if (cached) {
                    searchableBody = cached.body || '';
                    searchableNotes = cached.notes || '';
                }
            }

            const titleMatch = (p.title || '').toLowerCase().includes(lowerQuery);
            const bodyMatch = searchableBody.toLowerCase().includes(lowerQuery);
            const notesMatch = searchableNotes.toLowerCase().includes(lowerQuery);
            const tagMatch = (p.tags || []).join(' ').toLowerCase().includes(lowerQuery);

            return titleMatch || bodyMatch || notesMatch || tagMatch;
        });
    }

    /**
     * Create a snippet with highlighted match context
     * @param {string} text - Full text to search
     * @param {string} query - Search query
     * @param {number} maxLength - Maximum snippet length
     * @returns {string} HTML snippet with <mark> tags
     */
    function createMatchSnippet(text, query, maxLength = 70) {
        if (!text || !query) return '';

        const lines = text.split('\n');
        let bestMatch = { line: '', index: -1 };

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            const index = lowerLine.indexOf(query.toLowerCase());
            if (index > -1) {
                bestMatch = { line, index };
                break;
            }
        }

        if (bestMatch.index === -1) return '';

        const { line, index } = bestMatch;
        const queryLength = query.length;
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeQuery})`, 'gi');

        if (line.length <= maxLength) {
            return line.replace(regex, '<mark>$1</mark>');
        }

        const halfLength = Math.floor((maxLength - queryLength) / 2);
        let startIndex = index - halfLength;
        let endIndex = index + queryLength + halfLength;

        let prefix = '...';
        let suffix = '...';

        if (startIndex <= 0) {
            startIndex = 0;
            prefix = '';
        }
        if (endIndex >= line.length) {
            endIndex = line.length;
            suffix = '';
        }

        let snippet = line.substring(startIndex, endIndex);
        snippet = snippet.replace(regex, '<mark>$1</mark>');

        return prefix + snippet + suffix;
    }

    // ==================== TAG OPERATIONS ====================

    /**
     * Add a tag to global tags list (deduplicated)
     * @param {string} tagName - Tag to add
     * @param {Array} currentTags - Current global tags array
     * @returns {Array} New global tags array
     */
    function addGlobalTag(tagName, currentTags) {
        const trimmed = tagName.trim();
        if (!trimmed) return currentTags;
        const allTags = new Set([...currentTags, trimmed]);
        return Array.from(allTags).sort();
    }

    /**
     * Rename a tag across all prompts
     * @param {string} oldName - Old tag name
     * @param {string} newName - New tag name
     * @param {Array} globalTags - Current global tags
     * @param {Array} prompts - Prompts to update
     * @returns {Object} { globalTags: newArray, prompts: newArray, updatedPromptIds: Set }
     */
    function renameTag(oldName, newName, globalTags, prompts) {
        const trimmedNewName = newName.trim();
        if (!trimmedNewName || oldName === trimmedNewName) {
            return { globalTags, prompts, updatedPromptIds: new Set() };
        }

        // Update global tags
        const newGlobalTags = [...new Set([
            ...globalTags.filter(t => t !== oldName),
            trimmedNewName
        ])].sort();

        // Update prompts
        const updatedPrompts = prompts.map(p => {
            if (!p.tags || !p.tags.includes(oldName)) return p;
            const newTags = p.tags.map(t => t === oldName ? trimmedNewName : t);
            return { ...p, tags: [...new Set(newTags)] };
        });

        const updatedPromptIds = new Set(
            updatedPrompts.filter(p => p !== prompts.find(orig => orig.id === p.id)).map(p => p.id)
        );

        return {
            globalTags: newGlobalTags,
            prompts: updatedPrompts,
            updatedPromptIds
        };
    }

    /**
     * Delete a tag from all prompts and global tags
     * @param {string} tagName - Tag to delete
     * @param {Array} globalTags - Current global tags
     * @param {Array} prompts - Prompts to update
     * @returns {Object} { globalTags: newArray, prompts: newArray, deletedCount }
     */
    function deleteTag(tagName, globalTags, prompts) {
        // Remove from global tags
        const newGlobalTags = globalTags.filter(t => t !== tagName);

        // Count how many prompts had the tag before deletion
        const hadTagCount = prompts.filter(p => (p.tags || []).includes(tagName)).length;

        // Remove from prompts
        const updatedPrompts = prompts.map(p => {
            if (!p.tags || !p.tags.includes(tagName)) return p;
            return { ...p, tags: p.tags.filter(t => t !== tagName) };
        });

        const stillHasTagCount = updatedPrompts.filter(p => (p.tags || []).includes(tagName)).length;
        const deletedCount = hadTagCount - stillHasTagCount;

        return {
            globalTags: newGlobalTags,
            prompts: updatedPrompts,
            deletedCount
        };
    }

    // ==================== DRAG-DROP REORDERING ====================

    /**
     * Move a prompt to a new folder
     * @param {Object} prompt - Prompt to move
     * @param {number|null} newFolderId - Target folder ID (null = no folder)
     * @param {Array} folders - All folders (for lock status checks)
     * @returns {Object} Updated prompt
     */
    function movePromptToFolder(prompt, newFolderId, folders) {
        const newFolder = folders.find(f => f.id === newFolderId);
        const newFolderLocked = newFolder && newFolder.isLocked;

        // If moving into locked folder, strip encryption (caller must re-encrypt)
        // Return the updated prompt with new folderId
        return {
            ...prompt,
            folderId: newFolderId,
            dateModified: Date.now()
        };
    }

    // ==================== BULK OPERATIONS ====================

    /**
     * Bulk move prompts to a folder
     * @param {Array} promptsToMove - Prompts to move
     * @param {number|null} targetFolderId - Destination folder ID
     * @returns {Array} Updated prompts
     */
    function bulkMovePrompts(promptsToMove, targetFolderId) {
        return promptsToMove.map(p => ({
            ...p,
            folderId: targetFolderId,
            dateModified: Date.now()
        }));
    }

    // ==================== FOLDER OPERATIONS ====================

    /**
     * Create a new folder
     * @param {string} name - Folder name
     * @returns {Object} New folder object
     */
    function createFolder(name) {
        return {
            id: Date.now(),
            name: name.trim(),
            isLocked: false
        };
    }

    /**
     * Rename a folder
     * @param {Object} folder - Folder to rename
     * @param {string} newName - New name
     * @returns {Object} Updated folder
     */
    function renameFolder(folder, newName) {
        return { ...folder, name: newName.trim() };
    }

    /**
     * Delete a folder
     * @param {number} folderId - Folder ID to delete
     * @param {Array} folders - Current folders
     * @returns {Array} New folders array
     */
    function deleteFolder(folderId, folders) {
        return folders.filter(f => f.id !== folderId);
    }

    /**
     * Toggle folder lock status
     * @param {Object} folder - Folder to toggle
     * @param {boolean} isLocked - New lock status
     * @param {string} password - Password if locking
     * @returns {Object} Updated folder
     */
    function toggleFolderLock(folder, isLocked, password = null) {
        if (isLocked && !password) {
            throw new Error('Password required when locking folder');
        }

        return {
            ...folder,
            isLocked,
            passwordCheck: isLocked ? encryptCheck(String(folder.id), password) : null
        };
    }

    // ==================== VIEW/FILTERING ====================

    /**
     * Filter prompts by view criteria
     * @param {Array} prompts - All prompts
     * @param {Array} folders - All folders
     * @param {Object} view - { type: 'folder'|'tag'|'search', id: string|number }
     * @param {string} searchQuery - Optional search query (overrides view if present)
     * @returns {Array} Filtered prompts
     */
    function filterPrompts(prompts, folders, view, searchQuery = '') {
        let list = [...prompts];

        if (searchQuery) {
            return list; // Search handled separately
        }

        if (view.type === 'tag') {
            list = list.filter(p => (p.tags || []).includes(view.id));
        } else if (view.type === 'folder') {
            if (view.id === 'favorites') list = list.filter(p => p.isFavorite);
            else if (view.id === 'locked') list = list.filter(p => {
                const folder = folders.find(f => f.id === p.folderId);
                return p.isLocked || (folder && folder.isLocked);
            });
            else if (view.id !== 'all') list = list.filter(p => p.folderId === view.id);
        }

        return list;
    }

    /**
     * Sort prompts
     * @param {Array} prompts - Prompts to sort
     * @param {string} sortBy - Sort key and direction (e.g., 'dateCreated_desc', 'title_asc')
     * @returns {Array} Sorted prompts
     */
    function sortPrompts(prompts, sortBy) {
        const [sortKey, sortDir] = sortBy.split('_');
        return [...prompts].sort((a, b) => {
            let valA = a[sortKey], valB = b[sortKey];
            if (sortKey === 'title') {
                valA = (valA || '').toLowerCase();
                valB = (valB || '').toLowerCase();
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // ==================== EXPORT/IMPORT ====================

    /**
     * Serialize data for export
     * @param {Array} prompts - Prompts to export
     * @param {Array} folders - Folders to export (full array or subset)
     * @param {Array} globalTags - Global tags to export
     * @returns {Object} Export object
     */
    function serializeExport(prompts, folders, globalTags) {
        return {
            prompts: prompts.map(p => ({ ...p })), // Deep copy
            folders: folders.map(f => ({ ...f })), // Deep copy
            globalTags: [...globalTags]
        };
    }

    /**
     * Import data with conflict resolution
     * @param {Object} importData - Imported data { prompts, folders, globalTags }
     * @param {Array} existingPrompts - Current prompts
     * @param {Array} existingFolders - Current folders
     * @param {Array} existingTags - Current tags
     * @param {boolean} isPartial - If true, append only; if false, overwrite all
     * @returns {Object} { prompts: newArray, folders: newArray, globalTags: newArray }
     */
    function importData(importData, existingPrompts, existingFolders, existingTags, isPartial = false) {
        if (isPartial) {
            return {
                prompts: mergePrompts(existingPrompts, importData.prompts || []),
                folders: mergeFolders(existingFolders, importData.folders || []),
                globalTags: mergeGlobalTags(existingTags, importData.globalTags || [])
            };
        } else {
            // Full overwrite: use imported data directly (filtering by ID conflicts is handled upstream)
            return {
                prompts: importData.prompts || [],
                folders: importData.folders || [],
                globalTags: importData.globalTags || []
            };
        }
    }

    function mergePrompts(existing, incoming) {
        const existingIds = new Set(existing.map(p => p.id));
        const uniqueIncoming = incoming.filter(p => !existingIds.has(p.id));
        return [...existing, ...uniqueIncoming];
    }

    function mergeFolders(existing, incoming) {
        const existingIds = new Set(existing.map(f => f.id));
        const uniqueIncoming = incoming.filter(f => !existingIds.has(f.id));
        return [...existing, ...uniqueIncoming];
    }

    function mergeGlobalTags(existing, incoming) {
        const allTags = new Set([...existing, ...incoming]);
        return Array.from(allTags).sort();
    }

    // ==================== STATS & COUNTS ====================

    /**
     * Count prompts in a folder
     * @param {Array} prompts - All prompts
     * @param {number|null} folderId - Folder ID to count (null = no folder)
     * @returns {number} Count
     */
    function countPromptsInFolder(prompts, folderId) {
        return prompts.filter(p => p.folderId === folderId).length;
    }

    /**
     * Count prompts by tag
     * @param {Array} prompts - All prompts
     * @param {string} tag - Tag to count
     * @returns {number} Count
     */
    function countPromptsByTag(prompts, tag) {
        return prompts.filter(p => (p.tags || []).includes(tag)).length;
    }

    /**
     * Count locked prompts
     * @param {Array} prompts - All prompts
     * @param {Array} folders - All folders (to check folder lock)
     * @returns {number} Count of individually locked or in locked folders
     */
    function countLockedPrompts(prompts, folders) {
        return prompts.filter(p => {
            const folder = folders.find(f => f.id === p.folderId);
            return p.isLocked || (folder && folder.isLocked);
        }).length;
    }

    // ==================== PASSWORD VALIDATION ====================

    /**
     * Validate a password against a stored passwordCheck
     * @param {string|Object} passwordCheck - Stored encrypted check value
     * @param {string} password - Password to validate
     * @returns {Promise<boolean>} True if valid
     */
    async function validatePassword(passwordCheck, password) {
        const decrypted = await decryptCheck(passwordCheck, password);
        // The check should return the entity ID string if correct
        return decrypted !== null && decrypted !== undefined;
    }

    /**
     * Encrypt content for storage
     * @param {string} content - Plaintext content
     * @param {string} password - Encryption password
     * @returns {Promise<Object>} Encrypted object { ct, iv, salt }
     */
    async function encryptContent(content, password) {
        if (!content || !password) return content;
        // Use the global CryptoService if in browser context
        if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
            return await encryptWithWebCrypto(content, password);
        }
        // Fallback: return as plaintext (shouldn't happen in production)
        return content;
    }

    /**
     * Decrypt content
     * @param {Object|string} encrypted - Encrypted data or plaintext
     * @param {string} password - Decryption password
     * @returns {Promise<string|null>} Decrypted text or null if fails
     */
    async function decryptContent(encrypted, password) {
        if (!encrypted || !password) return encrypted;
        if (typeof encrypted === 'string') return encrypted; // Not encrypted

        if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
            return await decryptWithWebCrypto(encrypted, password);
        }
        return encrypted;
    }

    /**
     * Create encrypted check value (store entity ID encrypted)
     * @param {string} idString - String representation of entity ID
     * @param {string} password - Password
     * @returns {Promise<Object>} Encrypted check object
     */
    async function createPasswordCheck(idString, password) {
        return await encryptWithWebCrypto(idString, password);
    }

    // ==================== INTERNAL CRYPTO HELPERS ====================
    // These mirror the CryptoService methods for use in pure functions

    function _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function _base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async function _deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            { "name": "PBKDF2", salt: salt, "iterations": 100000, "hash": "SHA-256" },
            keyMaterial,
            { "name": "AES-GCM", "length": 256 },
            true,
            ["encrypt", "decrypt"]
        );
    }

    async function encryptWithWebCrypto(text, password) {
        try {
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const key = await _deriveKey(password, salt);

            const encryptedContent = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                key,
                new TextEncoder().encode(text)
            );

            return {
                ct: _arrayBufferToBase64(encryptedContent),
                iv: _arrayBufferToBase64(iv),
                salt: _arrayBufferToBase64(salt)
            };
        } catch (e) {
            console.error("Encryption failed", e);
            return text; // fallback
        }
    }

    async function decryptWithWebCrypto(encryptedData, password) {
        try {
            const salt = _base64ToArrayBuffer(encryptedData.salt);
            const iv = _base64ToArrayBuffer(encryptedData.iv);
            const key = await _deriveKey(password, salt);

            const decryptedContent = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                _base64ToArrayBuffer(encryptedData.ct)
            );

            return new TextDecoder().decode(decryptedContent);
        } catch (e) {
            console.error("Decryption failed", e);
            return null;
        }
    }

    // Exported alias for backward compatibility with existing tests
    const encryptCheck = createPasswordCheck;
    const decryptCheck = decryptContent;

    // ==================== PUBLIC API ====================
    return {
        // CRUD
        createPrompt,
        updatePrompt,
        deletePrompt,
        bulkDeletePrompts,

        // Search
        searchPrompts,
        createMatchSnippet,

        // Tags
        addGlobalTag,
        renameTag,
        deleteTag,

        // Drag-drop / Moving
        movePromptToFolder,
        bulkMovePrompts,

        // Folders
        createFolder,
        renameFolder,
        deleteFolder,
        toggleFolderLock,

        // View/Filter/Sort
        filterPrompts,
        sortPrompts,

        // Import/Export
        serializeExport,
        importData,

        // Stats
        countPromptsInFolder,
        countPromptsByTag,
        countLockedPrompts,

        // Password validation
        validatePassword,
        encryptContent,
        decryptContent,
        createPasswordCheck
    };
})();

// Expose for testing (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PromptCatLogic;
}
