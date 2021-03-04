#!/bin/bash
ffmpeg -f x11grab -r 15 $(slop -f '-video_size %wx%h -i +%x,%y') -vcodec rawvideo -pix_fmt yuv420p -threads 0 -f v4l2 -vf hflip,scale=1280x720 /dev/video2