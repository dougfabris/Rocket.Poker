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
                {
                    text: block.newPlainTextObject(story.finished ? 'Reopen Voting' : 'Finish Voting'),
                    value: story.finished ? 'reopen' : 'finish',
                },
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

    if (story.finished) {
        block.addContextBlock({
            elements: [
                block.newMarkdownTextObject(`✅ Voting finished at ${new Date().toUTCString()}`),
            ],
        });
    }

    // Create voting buttons
    if (!story.finished) {
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

    // Show voting results (only if showResults is true or voting is finished)
    if (!story.showResults && !story.finished) {
        // Don't show results during voting if closed
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
