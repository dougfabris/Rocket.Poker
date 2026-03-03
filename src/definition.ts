import { IUIKitBlockIncomingInteraction } from '@rocket.chat/apps-engine/definition/uikit/UIKitIncomingInteractionTypes';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

export type IVoterPerson = Pick<IUser, 'id' | 'username' | 'name'>;

export interface IVoter {
    quantity: number;
    voters: Array<IVoterPerson>;
}

export interface IPokerStory {
    msgId: string;
    uid: string; // user who created the story
    roomOwnerId: string; // discussion owner who can finish voting
    title: string;
    storyId?: string;
    link?: string;
    description?: string;
    votes: Array<IVoter>;
    totalVotes: number;
    finished?: boolean;
    finishedAt?: Date; // Timestamp when voting was finished
    showResults?: boolean; // Show results during voting or only when finished
}

export interface IModalContext extends Partial<IUIKitBlockIncomingInteraction> {
    threadId?: string;
    msgId?: string; // For editing existing stories
}