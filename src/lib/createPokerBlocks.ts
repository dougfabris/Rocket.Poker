import { BlockBuilder, BlockElementType } from '@rocket.chat/apps-engine/definition/uikit';

import { IPokerStory } from '../definition';
import { buildVoteGraph } from './buildVoteGraph';

function isValidUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
        return false;
    }
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export function createPokerBlocks(block: BlockBuilder, story: IPokerStory, showNames: boolean, votingOptions: string[]) {
    // Build the title with markdown header for more prominence
    const titleText = `### ${story.title}`;
    let storyIdText: string | undefined = undefined;

    if (story.storyId && story.link && isValidUrl(story.link)) {
        storyIdText = `**[${story.storyId}](${story.link})**`;
    } else if (story.storyId) {
        storyIdText = `**${story.storyId}**`;
    }

    if (storyIdText) {
        block.addContextBlock({
            elements: [
                block.newMarkdownTextObject(storyIdText),
            ],
        });
    }


    // Add title as a header block for more visual prominence
    block.addSectionBlock({
        text: block.newMarkdownTextObject(titleText),
        accessory: {
            type: BlockElementType.OVERFLOW_MENU,
            actionId: 'storyActions',
            options: [
                {
                    text: block.newPlainTextObject('Edit story'),
                    value: 'edit',
                },
                ...(story.closed && !story.closedAt ? [{
                    text: block.newPlainTextObject('Open voting'),
                    value: 'start',
                }] : []),
                ...(story.closed && story.closedAt ? [{
                    text: block.newPlainTextObject('Reopen voting'),
                    value: 'reopen',
                }] : []),
                ...(!story.closed ? [{
                    text: block.newPlainTextObject('Close voting'),
                    value: 'finish',
                }] : []),
            ],
        },
    });

    // Add description if provided
    if (story.description) {
        block.addContextBlock({
            elements: [
                block.newMarkdownTextObject(story.description),
            ],
        });
    }

    // Add voting status indicator
    if (story.closed && story.closedAt) {
        // Voting has been closed at least once
        const closeDate = new Date(story.closedAt);
        const dateStr = closeDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
        const timeStr = closeDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
        const closeTimeText = `✅ Voting closed on ${dateStr} at ${timeStr}`;
        block.addContextBlock({
            elements: [
                block.newMarkdownTextObject(closeTimeText),
            ],
        });
    } else if (!story.closed) {
        // Show voting in progress indicator
        block.addContextBlock({
            elements: [
                block.newMarkdownTextObject('🗳️ **Voting in progress** - Cast your vote below'),
            ],
        });
    } else {
        // Voting not started yet (closed but no closedAt)
        block.addContextBlock({
            elements: [
                block.newMarkdownTextObject('⏸️ **Voting not started** - Waiting for session owner to open voting'),
            ],
        });
    }

    // Create voting buttons (only when voting is open)
    if (!story.closed) {
        const buttonElements = votingOptions.map((option, index) => {
            return block.newButtonElement({
                actionId: 'votePoker',
                text: block.newPlainTextObject(option),
                value: String(index),
            });
        });

        block.addActionsBlock({
            blockId: 'voting-buttons',
            elements: buttonElements,
        });

        // Show who has voted (without revealing their choices)
        const allVoters: Array<string> = [];
        story.votes.forEach((vote) => {
            vote.voters.forEach((voter) => {
                const voterName = showNames ? voter.name : voter.username;
                if (!allVoters.includes(voterName)) {
                    allVoters.push(voterName);
                }
            });
        });

        if (allVoters.length > 0) {
            block.addDividerBlock();
            allVoters.sort((a, b) => a.toLowerCase() > b.toLowerCase() ? 1 : -1);
            block.addContextBlock({
                elements: [
                    block.newMarkdownTextObject(`👥 **Voted** (${allVoters.length}): ${allVoters.join(', ')}`),
                ],
            });
        }
    }

    // Show voting results (only if showResults is true or voting is closed)
    if (!story.showResults && !story.closed) {
        // Don't show results during voting unless showResults is enabled
        return;
    }


    // Show voting results
    votingOptions.forEach((option, index) => {
        if (!story.votes[index]) {
            return;
        }

        const voteCount = story.votes[index].quantity;
        const voters = story.votes[index].voters;

        if (voteCount === 0) {
            return;
        }

        const voterNames = voters
            .map(voter => showNames ? voter.name : voter.username)
            .join(', ');

        // Build the graph visualization
        const graph = buildVoteGraph(story.votes[index], story.totalVotes);

        block.addSectionBlock({
            text: block.newMarkdownTextObject(
                `**${option}**\n${graph}\n${voterNames}`
            ),
        });
    });
}
