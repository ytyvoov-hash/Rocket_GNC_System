
static union//دالة الارسال
{
	struct
	{
	unsigned char sync1;//0 index
	unsigned char sync2;//1
	 uint16_t yaw;  //Angle X 
	uint16_t pitch;//Angle Y
	uint16_t yaw_rate;//Rate X 
	uint16_t pitch_rate;//Rate Y
	uint16_t x_pos;//احداثيات الهدف كم يبعد الهدف من المركز بالبكسل
	uint16_t y_pos;//احداثيات الهدف كم يبعد الهدف من المركز بالبكسل
	unsigned char gpu_temp;//CPU
	unsigned char work;//التاكد من وجود صوره من الكاميرا عند اول تشغيل التطبيق
	unsigned char IPU;//  /home/mh/KKK/4kk_640*640/CarTracking4surfaces2/CarTracking4surfaces1/CarTracking4/Screenshot from 2026-04-03 17-16-40.png
	unsigned char Target_w;//حجم الهدف 
	unsigned char Target_h;//حجم الهدف 
	unsigned char fire;//23
	uint16_t zoom;
    unsigned int crc;				
	}SendToPhon;
	unsigned char Bytes[24];
}buffseeker;

typedef struct SeekerData//دالة الاستقبال
{
	unsigned char header1;
	unsigned char header2;
	unsigned char stab; // 1 = ON, 0 = OFF
	unsigned char mode;	//0:None  1:pos	  2:rate    3:self_test	  4:setzero 
	uint16_t yaw_val;//Yaw
	uint16_t pitch_val;//Pitch
	unsigned char ctrl;///home/mh/KKK/4kk_640*640/CarTracking4surfaces2/CarTracking4surfaces1/CarTracking4/Screenshot from 2026-04-03 17-28-41.png
	unsigned int time;//متغير
	unsigned char target;//متغير
	unsigned char slantRng[3];//متغير
	unsigned char mis_type;//متغير
	char res[2];//متغير
};
