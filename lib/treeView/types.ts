export interface TreeTag<Type extends TreeTagType> {
	name: string;
	type: Type;
	value: Type extends TreeTagContainerType
		? (string | number | TreeTag<TreeTagType>)[]
		: undefined | string | number;
}

export type TreeTagType = TreeTagValueType | TreeTagContainerType;
export enum TreeTagValueType {
	Byte = "byte",
	ShortInt = "short",
	Int = "int",
	LongInt = "long",
	Float = "float",
	DoubleFloat = "double",
	String = "string",
	CompoundEnd = "end",
}

export enum TreeTagContainerType {
	ByteArray = "byteArray",
	IntArray = "intArray",
	LongIntArray = "longArray",
	List = "list",
	Compound = "compound",
}
