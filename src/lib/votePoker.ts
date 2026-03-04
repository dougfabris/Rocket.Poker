import { IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IUIKitBlockIncomingInteraction } from '@rocket.chat/apps-engine/definition/uikit/UIKitIncomingInteractionTypes';

import { createPokerBlocks } from './createPokerBlocks';
import { getPokerStory } from './getPokerStory';
import { storePokerVote } from './storePokerVote';
import { getVotingOptions } from './getVotingOptions';

export async function votePoker({ data, read, persistence, modify }: {
    data: IUIKitBlockIncomingInteraction,
    read: IRead,
    persistence: IPersistence,
    modify: IModify,
}) {
    if (!data.message) {
        return {
            success: true,
        };
    }

    const story = await getPokerStory(String(data.message.id), read);
    if (!story) {
        throw new Error('Story not found');
    }

    if (story.closed) {
        throw new Error('Voting is closed');
    }

    // Check if user is a member of the discussion
    if (data.room) {
        const roomMembers = await read.getRoomReader().getMembers(data.room.id);
        const isMember = roomMembers.some(member => member.id === data.user.id);
        
        if (!isMember) {
            // Send DM to user via app bot
            const appUser = await read.getUserReader().getAppUser();
            if (appUser) {
                const messageBuilder = modify.getCreator().startMessage()
                    .setSender(appUser)
                    .setText('❌ You must join the discussion before voting.');
                
                messageBuilder.setRoom(data.room);
                
                await modify.getNotifier().notifyUser(data.user, messageBuilder.getMessage());
            }
            
            return {
                success: false,
            };
        }
    }

    await storePokerVote(story, parseInt(String(data.value), 10), data.user, { persis: persistence });

    const message = await modify.getUpdater().message(data.message.id as string, data.user);
    message.setEditor(message.getSender());

    const block = modify.getCreator().getBlockBuilder();

    const showNames = await read.getEnvironmentReader().getSettings().getById('use-user-name');
    const votingOptions = await getVotingOptions(read);

    createPokerBlocks(block, story, showNames.value, votingOptions);

    message.setBlocks(block);

    return modify.getUpdater().finish(message);
}
